import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DropStatus,
  OrderStatus,
  OrderEventType,
  UserStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { MarkDeliveredDto } from './dto/mark-delivered.dto';

export function getKolkataTodayString(now: Date = new Date()): string {
  const kolkataOffsetMs = 5.5 * 60 * 60 * 1000;
  const kolkataTime = new Date(now.getTime() + kolkataOffsetMs);
  return kolkataTime.toISOString().slice(0, 10);
}

export function parseKolkataCalendarDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export function formatMinutesToTime(minutes: number): string {
  const hh = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const mm = (minutes % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export function calculateScheduledDeliveryUtc(
  deliveryDate: Date,
  deliveryTimeMinutes: number,
): Date {
  const dateStr = deliveryDate.toISOString().slice(0, 10);
  const [y, m, d] = dateStr.split('-').map(Number);
  // Midnight in Asia/Kolkata is 18:30 UTC of previous day (-5.5h)
  const istMidnightUtcMs =
    Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 5.5 * 60 * 60 * 1000;
  return new Date(istMidnightUtcMs + deliveryTimeMinutes * 60 * 1000);
}

@Injectable()
export class DispatchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates or reconciles drops for confirmed orders on a given calendar date.
   * Grouping invariant: same company + same delivery address + exact same delivery time.
   * Idempotent: repeated calls produce identical drops and 0 duplicates.
   */
  async generateDropsForDate(
    dateStr?: string,
    now: Date = new Date(),
  ): Promise<{ date: string; dropsCreated: number; totalDrops: number }> {
    const targetDateStr = dateStr || getKolkataTodayString(now);
    const calendarDate = parseKolkataCalendarDate(targetDateStr);

    // 1. Fetch all confirmed or delivered orders for this delivery date
    const eligibleOrders = await this.prisma.order.findMany({
      where: {
        deliveryDate: calendarDate,
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.DELIVERED] },
        delivery: { isNot: null },
      },
      include: {
        delivery: true,
        company: true,
        dropOrder: {
          include: {
            drop: true,
          },
        },
      },
      orderBy: { orderNumber: 'asc' },
    });

    let dropsCreated = 0;

    // 2. Iterate each eligible order and ensure correct drop grouping
    for (const order of eligibleOrders) {
      if (!order.delivery) continue;

      const companyId = order.companyId;
      const deliveryTimeMinutes = order.delivery.deliveryTimeMinutes;
      const addressKey = order.delivery.companyAddressId;

      // Check if existing dropOrder link is stale
      if (order.dropOrder) {
        const existingDrop = order.dropOrder.drop;
        const matchesCurrent =
          existingDrop.companyId === companyId &&
          existingDrop.deliveryDate.toISOString().slice(0, 10) ===
            calendarDate.toISOString().slice(0, 10) &&
          existingDrop.deliveryTimeMinutes === deliveryTimeMinutes &&
          existingDrop.addressKey === addressKey;

        if (matchesCurrent) {
          // Correctly grouped
          continue;
        } else {
          // Delivery details changed - unlink from stale drop
          await this.prisma.dropOrder.delete({
            where: { orderId: order.id },
          });

          // If old drop is now empty and not delivered, remove it
          const remainingOrdersInOldDrop = await this.prisma.dropOrder.count({
            where: { dropId: existingDrop.id },
          });
          if (
            remainingOrdersInOldDrop === 0 &&
            existingDrop.status !== DropStatus.DELIVERED
          ) {
            await this.prisma.drop.delete({
              where: { id: existingDrop.id },
            });
          }
        }
      }

      // Find or create matching drop for (companyId, calendarDate, deliveryTimeMinutes, addressKey)
      let drop = await this.prisma.drop.findUnique({
        where: {
          companyId_deliveryDate_deliveryTimeMinutes_addressKey: {
            companyId,
            deliveryDate: calendarDate,
            deliveryTimeMinutes,
            addressKey,
          },
        },
      });

      if (!drop) {
        // Resolve default driver if company has one configured
        let defaultDriverId: string | null = null;
        if (order.company.defaultDriverId) {
          const eligibleDriver = await this.prisma.user.findFirst({
            where: {
              id: order.company.defaultDriverId,
              status: UserStatus.ACTIVE,
              role: {
                OR: [
                  { name: 'DRIVER' },
                  {
                    permissions: {
                      some: {
                        permission: { key: 'driver.read_own_deliveries' },
                      },
                    },
                  },
                ],
              },
            },
          });
          if (eligibleDriver) {
            defaultDriverId = eligibleDriver.id;
          }
        }

        drop = await this.prisma.drop.create({
          data: {
            companyId,
            driverId: defaultDriverId,
            deliveryDate: calendarDate,
            deliveryTimeMinutes,
            addressKey,
            addressLine1Snapshot: order.delivery.addressLine1Snapshot,
            addressLine2Snapshot: order.delivery.addressLine2Snapshot,
            citySnapshot: order.delivery.citySnapshot,
            stateSnapshot: order.delivery.stateSnapshot,
            postalCodeSnapshot: order.delivery.postalCodeSnapshot,
            standingInstructionsSnapshot:
              order.company.driverInstructions ||
              order.delivery.deliveryInstructionsSnapshot,
            status: DropStatus.KITCHEN_READY,
            kitchenReadyAt: order.kitchenReadyAt || null,
          },
        });
        dropsCreated++;
      }

      // Link order to drop via DropOrder
      await this.prisma.dropOrder.upsert({
        where: { orderId: order.id },
        update: { dropId: drop.id },
        create: {
          dropId: drop.id,
          orderId: order.id,
        },
      });
    }

    // 3. Update kitchen readiness on drops for the date
    const allDropsOnDate = await this.prisma.drop.findMany({
      where: { deliveryDate: calendarDate },
      include: {
        orders: {
          include: {
            order: {
              select: { kitchenReadyAt: true },
            },
          },
        },
      },
    });

    for (const d of allDropsOnDate) {
      if (d.orders.length > 0) {
        const allReady = d.orders.every((o) => o.order.kitchenReadyAt !== null);
        if (allReady && !d.kitchenReadyAt) {
          const latestKitchenReady = d.orders.reduce(
            (latest: Date | null, curr) => {
              if (!curr.order.kitchenReadyAt) return latest;
              if (!latest) return curr.order.kitchenReadyAt;
              return curr.order.kitchenReadyAt > latest
                ? curr.order.kitchenReadyAt
                : latest;
            },
            null,
          );
          if (latestKitchenReady) {
            await this.prisma.drop.update({
              where: { id: d.id },
              data: { kitchenReadyAt: latestKitchenReady },
            });
          }
        }
      }
    }

    const totalDrops = await this.prisma.drop.count({
      where: { deliveryDate: calendarDate },
    });

    return {
      date: targetDateStr,
      dropsCreated,
      totalDrops,
    };
  }

  /**
   * Reconciles a single order's drop when its delivery parameters change.
   */
  async reconcileOrderDrop(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        delivery: true,
        company: true,
        dropOrder: {
          include: {
            drop: true,
          },
        },
      },
    });

    if (!order || !order.delivery) return;

    if (
      order.status !== OrderStatus.CONFIRMED &&
      order.status !== OrderStatus.DELIVERED
    ) {
      if (order.dropOrder) {
        const dropId = order.dropOrder.dropId;
        await this.prisma.dropOrder.delete({ where: { orderId: order.id } });
        const remaining = await this.prisma.dropOrder.count({
          where: { dropId },
        });
        if (remaining === 0) {
          await this.prisma.drop.deleteMany({
            where: { id: dropId, status: { not: DropStatus.DELIVERED } },
          });
        }
      }
      return;
    }

    const dateStr = order.deliveryDate.toISOString().slice(0, 10);
    await this.generateDropsForDate(dateStr);
  }

  /**
   * Lists drops for a given date with optional status filtering.
   */
  async findAllDrops(dateStr?: string, statusFilter?: DropStatus) {
    const targetDateStr = dateStr || getKolkataTodayString();
    await this.generateDropsForDate(targetDateStr);
    const calendarDate = parseKolkataCalendarDate(targetDateStr);

    const drops = await this.prisma.drop.findMany({
      where: {
        deliveryDate: calendarDate,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            driverInstructions: true,
            defaultDriverId: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        orders: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                totalCents: true,
                kitchenReadyAt: true,
                dispatchReadyAt: true,
                outForDeliveryAt: true,
                deliveredAt: true,
                employee: {
                  select: { id: true, firstName: true, lastName: true },
                },
                lines: {
                  select: {
                    id: true,
                    quantity: true,
                    dishNameSnapshot: true,
                  },
                },
              },
            },
          },
        },
        deliveryRecord: true,
      },
      orderBy: { deliveryTimeMinutes: 'asc' },
    });

    const formattedDrops = drops.map((d) => this.formatDrop(d));

    // Summary metrics
    const summary = {
      totalDrops: formattedDrops.length,
      kitchenReadyDrops: formattedDrops.filter(
        (d) => d.status === DropStatus.KITCHEN_READY,
      ).length,
      dispatchReadyDrops: formattedDrops.filter(
        (d) => d.status === DropStatus.DISPATCH_READY,
      ).length,
      outForDeliveryDrops: formattedDrops.filter(
        (d) => d.status === DropStatus.OUT_FOR_DELIVERY,
      ).length,
      deliveredDrops: formattedDrops.filter(
        (d) => d.status === DropStatus.DELIVERED,
      ).length,
      unassignedDrops: formattedDrops.filter((d) => !d.driverId).length,
    };

    return {
      date: targetDateStr,
      summary,
      drops: formattedDrops,
    };
  }

  /**
   * Driver's view: returns only the driver's own assigned drops for TODAY in Asia/Kolkata.
   * Server-side filtering enforces:
   *  - driverId equals authenticated user id
   *  - deliveryDate is today in Asia/Kolkata
   *  - ordered by deliveryTimeMinutes ascending
   */
  async findDriverDrops(
    driverId: string,
    dateStr?: string,
    now: Date = new Date(),
  ) {
    const todayKolkataStr = getKolkataTodayString(now);

    // If a driver passes a date that is not today, strictly enforce today
    const targetDateStr =
      dateStr && dateStr === todayKolkataStr ? dateStr : todayKolkataStr;

    await this.generateDropsForDate(targetDateStr, now);
    const calendarDate = parseKolkataCalendarDate(targetDateStr);

    const drops = await this.prisma.drop.findMany({
      where: {
        driverId,
        deliveryDate: calendarDate,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            driverInstructions: true,
          },
        },
        orders: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                kitchenReadyAt: true,
                lines: {
                  select: {
                    id: true,
                    quantity: true,
                    dishNameSnapshot: true,
                  },
                },
              },
            },
          },
        },
        deliveryRecord: true,
      },
      orderBy: { deliveryTimeMinutes: 'asc' },
    });

    return {
      date: targetDateStr,
      driverId,
      drops: drops.map((d) => this.formatDrop(d)),
    };
  }

  /**
   * Returns a single drop with data-scoping check.
   */
  async findOneDrop(id: string, requestingUser?: AuthenticatedUser) {
    const drop = await this.prisma.drop.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            driverInstructions: true,
            defaultDriverId: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        orders: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                totalCents: true,
                kitchenReadyAt: true,
                dispatchReadyAt: true,
                outForDeliveryAt: true,
                deliveredAt: true,
                employee: {
                  select: { id: true, firstName: true, lastName: true },
                },
                lines: {
                  select: {
                    id: true,
                    quantity: true,
                    dishNameSnapshot: true,
                  },
                },
              },
            },
          },
        },
        deliveryRecord: true,
      },
    });

    if (!drop) {
      throw new NotFoundException(`Drop with ID '${id}' not found`);
    }

    // Driver scoping: if user is only a driver and not dispatch/admin, ensure they only view their own drop
    if (requestingUser) {
      const hasDispatchRead =
        requestingUser.permissions?.includes('dispatch.read');
      if (!hasDispatchRead && drop.driverId !== requestingUser.id) {
        throw new ForbiddenException(
          'You can only view your own assigned deliveries',
        );
      }
    }

    return this.formatDrop(drop);
  }

  /**
   * Assigns or unassigns a driver to a drop.
   * Validates active driver eligibility and ensures drop is not already DELIVERED.
   */
  async assignDriver(
    dropId: string,
    driverId?: string | null,
    _requestingUser?: AuthenticatedUser,
  ) {
    const drop = await this.prisma.drop.findUnique({
      where: { id: dropId },
    });

    if (!drop) {
      throw new NotFoundException(`Drop with ID '${dropId}' not found`);
    }

    if (drop.status === DropStatus.DELIVERED) {
      throw new BadRequestException(
        'Cannot assign or change driver for an already delivered drop',
      );
    }

    let finalDriverId: string | null = null;
    if (driverId) {
      const driverUser = await this.prisma.user.findUnique({
        where: { id: driverId },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      });

      if (!driverUser || driverUser.status !== UserStatus.ACTIVE) {
        throw new BadRequestException('Driver user not found or is inactive');
      }

      const isEligible =
        driverUser.role.name === 'DRIVER' ||
        driverUser.role.permissions.some(
          (rp) => rp.permission.key === 'driver.read_own_deliveries',
        );

      if (!isEligible) {
        throw new BadRequestException(
          'Selected user is not an active, eligible driver',
        );
      }

      finalDriverId = driverUser.id;
    }

    const updated = await this.prisma.drop.update({
      where: { id: dropId },
      data: { driverId: finalDriverId },
      include: {
        company: true,
        driver: { select: { id: true, name: true, email: true } },
        orders: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                kitchenReadyAt: true,
              },
            },
          },
        },
        deliveryRecord: true,
      },
    });

    return this.formatDrop(updated);
  }

  /**
   * Transitions drop from KITCHEN_READY to DISPATCH_READY.
   * Requires:
   *  - drop.status === KITCHEN_READY
   *  - all orders in drop have kitchenReadyAt !== null
   */
  async markDispatchReady(
    dropId: string,
    requestingUser?: AuthenticatedUser,
    now: Date = new Date(),
  ) {
    const drop = await this.prisma.drop.findUnique({
      where: { id: dropId },
      include: {
        orders: {
          include: {
            order: {
              select: { id: true, kitchenReadyAt: true, dispatchReadyAt: true },
            },
          },
        },
      },
    });

    if (!drop) {
      throw new NotFoundException(`Drop with ID '${dropId}' not found`);
    }

    if (drop.status !== DropStatus.KITCHEN_READY) {
      if (drop.status === DropStatus.DISPATCH_READY) {
        throw new ConflictException('Drop is already dispatch-ready');
      }
      throw new BadRequestException(
        `Cannot mark drop dispatch-ready from status '${drop.status}'`,
      );
    }

    const allKitchenReady = drop.orders.every(
      (doItem) => doItem.order.kitchenReadyAt !== null,
    );

    if (!allKitchenReady) {
      throw new BadRequestException(
        'Cannot mark drop dispatch-ready: not all orders are kitchen-ready',
      );
    }

    // Atomic transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await tx.drop.update({
        where: { id: dropId },
        data: {
          status: DropStatus.DISPATCH_READY,
          dispatchReadyAt: now,
        },
        include: {
          company: true,
          driver: { select: { id: true, name: true, email: true } },
          orders: {
            include: {
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  status: true,
                  kitchenReadyAt: true,
                  dispatchReadyAt: true,
                  outForDeliveryAt: true,
                  deliveredAt: true,
                  employee: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                  lines: {
                    select: {
                      id: true,
                      quantity: true,
                      dishNameSnapshot: true,
                    },
                  },
                },
              },
            },
          },
          deliveryRecord: true,
        },
      });

      for (const item of drop.orders) {
        await tx.order.updateMany({
          where: { id: item.order.id, dispatchReadyAt: null },
          data: { dispatchReadyAt: now },
        });

        await tx.orderEvent.create({
          data: {
            orderId: item.order.id,
            type: OrderEventType.DISPATCH_READY,
            userId: requestingUser?.id,
            metadata: { dropId },
          },
        });
      }

      return d;
    });

    return this.formatDrop(updated);
  }

  /**
   * Transitions drop from DISPATCH_READY to OUT_FOR_DELIVERY.
   * Requires:
   *  - drop.status === DISPATCH_READY
   *  - driver is assigned (drop.driverId !== null)
   */
  async markOutForDelivery(
    dropId: string,
    requestingUser?: AuthenticatedUser,
    now: Date = new Date(),
  ) {
    const drop = await this.prisma.drop.findUnique({
      where: { id: dropId },
      include: {
        orders: {
          include: {
            order: {
              select: { id: true, outForDeliveryAt: true },
            },
          },
        },
      },
    });

    if (!drop) {
      throw new NotFoundException(`Drop with ID '${dropId}' not found`);
    }

    if (drop.status !== DropStatus.DISPATCH_READY) {
      if (drop.status === DropStatus.KITCHEN_READY) {
        throw new BadRequestException(
          'Drop must be dispatch-ready before it can be out for delivery',
        );
      }
      if (drop.status === DropStatus.OUT_FOR_DELIVERY) {
        throw new ConflictException('Drop is already out for delivery');
      }
      if (drop.status === DropStatus.DELIVERED) {
        throw new BadRequestException('Drop is already delivered');
      }
      throw new BadRequestException(
        `Cannot transition drop to out-for-delivery from '${drop.status}'`,
      );
    }

    if (!drop.driverId) {
      throw new BadRequestException(
        'Cannot mark drop out-for-delivery without an assigned driver',
      );
    }

    // Atomic transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await tx.drop.update({
        where: { id: dropId },
        data: {
          status: DropStatus.OUT_FOR_DELIVERY,
          outForDeliveryAt: now,
        },
        include: {
          company: true,
          driver: { select: { id: true, name: true, email: true } },
          orders: {
            include: {
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  status: true,
                  kitchenReadyAt: true,
                  dispatchReadyAt: true,
                  outForDeliveryAt: true,
                  deliveredAt: true,
                  employee: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                  lines: {
                    select: {
                      id: true,
                      quantity: true,
                      dishNameSnapshot: true,
                    },
                  },
                },
              },
            },
          },
          deliveryRecord: true,
        },
      });

      for (const item of drop.orders) {
        await tx.order.updateMany({
          where: { id: item.order.id, outForDeliveryAt: null },
          data: { outForDeliveryAt: now },
        });

        await tx.orderEvent.create({
          data: {
            orderId: item.order.id,
            type: OrderEventType.OUT_FOR_DELIVERY,
            userId: requestingUser?.id,
            metadata: { dropId, driverId: drop.driverId },
          },
        });
      }

      return d;
    });

    return this.formatDrop(updated);
  }

  /**
   * Marks drop DELIVERED with optional note and photo.
   * Requires:
   *  - caller is assigned driver (or dispatch/admin)
   *  - drop.status === OUT_FOR_DELIVERY
   * Calculates isOnTime deterministically against scheduled delivery date/time in Asia/Kolkata.
   * Transitions contained orders to DELIVERED.
   */
  async markDelivered(
    dropId: string,
    dto: MarkDeliveredDto,
    requestingUser?: AuthenticatedUser,
    now: Date = new Date(),
  ) {
    const drop = await this.prisma.drop.findUnique({
      where: { id: dropId },
      include: {
        orders: {
          include: {
            order: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!drop) {
      throw new NotFoundException(`Drop with ID '${dropId}' not found`);
    }

    // Authorization & Driver Scoping check:
    // If user does not have dispatch.update_status, they must be the assigned driver
    if (requestingUser) {
      const hasDispatchUpdate = requestingUser.permissions?.includes(
        'dispatch.update_status',
      );
      if (!hasDispatchUpdate) {
        if (!drop.driverId || drop.driverId !== requestingUser.id) {
          throw new ForbiddenException(
            'You can only mark your own assigned deliveries as delivered',
          );
        }
      }
    }

    if (drop.status !== DropStatus.OUT_FOR_DELIVERY) {
      if (drop.status === DropStatus.DELIVERED) {
        throw new ConflictException('Drop is already delivered');
      }
      throw new BadRequestException(
        'Drop must be OUT_FOR_DELIVERY to be marked delivered',
      );
    }

    // Deterministic On-Time calculation
    const scheduledDeliveryUtc = calculateScheduledDeliveryUtc(
      drop.deliveryDate,
      drop.deliveryTimeMinutes,
    );
    const isOnTime = now.getTime() <= scheduledDeliveryUtc.getTime();

    // Atomic transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.drop.update({
        where: { id: dropId },
        data: {
          status: DropStatus.DELIVERED,
          deliveredAt: now,
          isOnTime,
        },
        include: {
          company: true,
          driver: { select: { id: true, name: true, email: true } },
          orders: {
            include: {
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  status: true,
                  kitchenReadyAt: true,
                  dispatchReadyAt: true,
                  outForDeliveryAt: true,
                  deliveredAt: true,
                  employee: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                  lines: {
                    select: {
                      id: true,
                      quantity: true,
                      dishNameSnapshot: true,
                    },
                  },
                },
              },
            },
          },
          deliveryRecord: true,
        },
      });

      // Create or update DeliveryRecord
      await tx.deliveryRecord.upsert({
        where: { dropId },
        update: {
          deliveredAt: now,
          note: dto.note || null,
          photoUrl: dto.photoUrl || null,
        },
        create: {
          dropId,
          deliveredAt: now,
          note: dto.note || null,
          photoUrl: dto.photoUrl || null,
        },
      });

      // Update contained orders to DELIVERED
      for (const item of drop.orders) {
        await tx.order.update({
          where: { id: item.order.id },
          data: {
            status: OrderStatus.DELIVERED,
            deliveredAt: now,
          },
        });

        await tx.orderEvent.create({
          data: {
            orderId: item.order.id,
            type: OrderEventType.DELIVERED,
            userId: requestingUser?.id,
            note: dto.note,
            metadata: {
              dropId,
              deliveredAt: now,
              isOnTime,
              note: dto.note,
              photoUrl: dto.photoUrl,
            },
          },
        });
      }

      return tx.drop.findUnique({
        where: { id: dropId },
        include: {
          company: true,
          driver: { select: { id: true, name: true, email: true } },
          orders: {
            include: {
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  status: true,
                  kitchenReadyAt: true,
                  dispatchReadyAt: true,
                  outForDeliveryAt: true,
                  deliveredAt: true,
                  employee: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                  lines: {
                    select: {
                      id: true,
                      quantity: true,
                      dishNameSnapshot: true,
                    },
                  },
                },
              },
            },
          },
          deliveryRecord: true,
        },
      });
    });

    return this.formatDrop(updated);
  }

  /**
   * Helper to format a drop object with computed fields.
   */
  private formatDrop(drop: any) {
    const scheduledDeliveryUtc = calculateScheduledDeliveryUtc(
      drop.deliveryDate,
      drop.deliveryTimeMinutes,
    );

    return {
      id: drop.id,
      companyId: drop.companyId,
      companyName: drop.company?.name || null,
      driverId: drop.driverId,
      driver: drop.driver
        ? {
            id: drop.driver.id,
            name: drop.driver.name,
            email: drop.driver.email,
          }
        : null,
      deliveryDate: drop.deliveryDate.toISOString().slice(0, 10),
      deliveryTimeMinutes: drop.deliveryTimeMinutes,
      deliveryTimeFormatted: formatMinutesToTime(drop.deliveryTimeMinutes),
      scheduledDeliveryUtc,
      addressKey: drop.addressKey,
      address: {
        line1: drop.addressLine1Snapshot,
        line2: drop.addressLine2Snapshot,
        city: drop.citySnapshot,
        state: drop.stateSnapshot,
        postalCode: drop.postalCodeSnapshot,
      },
      standingInstructions: drop.standingInstructionsSnapshot,
      status: drop.status,
      kitchenReadyAt: drop.kitchenReadyAt,
      dispatchReadyAt: drop.dispatchReadyAt,
      outForDeliveryAt: drop.outForDeliveryAt,
      deliveredAt: drop.deliveredAt,
      isOnTime: drop.isOnTime,
      ordersCount: drop.orders?.length || 0,
      orders: (drop.orders || []).map((o: any) => ({
        id: o.order.id,
        orderNumber: o.order.orderNumber,
        status: o.order.status,
        totalCents: o.order.totalCents,
        kitchenReadyAt: o.order.kitchenReadyAt,
        dispatchReadyAt: o.order.dispatchReadyAt,
        outForDeliveryAt: o.order.outForDeliveryAt,
        deliveredAt: o.order.deliveredAt,
        employeeName: o.order.employee
          ? `${o.order.employee.firstName} ${o.order.employee.lastName}`
          : null,
        itemsCount: (o.order.lines || []).reduce(
          (sum: number, l: any) => sum + l.quantity,
          0,
        ),
      })),
      deliveryRecord: drop.deliveryRecord
        ? {
            id: drop.deliveryRecord.id,
            deliveredAt: drop.deliveryRecord.deliveredAt,
            note: drop.deliveryRecord.note,
            photoUrl: drop.deliveryRecord.photoUrl,
          }
        : null,
      createdAt: drop.createdAt,
      updatedAt: drop.updatedAt,
    };
  }

  /**
   * Returns active users eligible for driver assignment.
   */
  async findEligibleDrivers() {
    return this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        OR: [
          { role: { name: 'DRIVER' } },
          {
            role: {
              permissions: {
                some: { permission: { key: 'driver.read_own_deliveries' } },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    });
  }
}

