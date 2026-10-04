import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { MenuService } from '../menu/menu.service';
import { CompaniesService } from '../companies/companies.service';
import { CutoffService } from './cutoff.service';
import { KitchenService } from '../kitchen/kitchen.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { OrderEventType, OrderStatus, Prisma } from '@prisma/client';
import {
  CreateCombinationOptionDto,
  CreateOrderDto,
  CreateOrderLineDto,
} from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { AdminOverrideDto } from './dto/admin-override.dto';
import { QueryOrderDto } from './dto/query-order.dto';

interface NormalizedCombination {
  quantity: number;
  unitPriceCents: number;
  combinationTotalCents: number;
  options: Array<{
    optionId: string;
    optionGroupId: string;
    optionGroupNameSnapshot: string;
    optionNameSnapshot: string;
    optionPriceCents: number;
    portionSizeId?: string;
    portionNameSnapshot?: string;
    portionExtraCents: number;
  }>;
}

interface ProcessedLine {
  dishId: string;
  dishNameSnapshot: string;
  dishSkuSnapshot: string;
  dishUnitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  combinations: NormalizedCombination[];
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly menuService: MenuService,
    private readonly companiesService: CompaniesService,
    private readonly cutoffService: CutoffService,
    @Optional() private readonly kitchenService?: KitchenService,
    @Optional() private readonly dispatchService?: DispatchService,
  ) {}

  /**
   * Generates a unique, human-friendly order identifier: FK-YYYY-XXXX (e.g. FK-2026-0001).
   */
  private async generateOrderNumber(tx?: any): Promise<string> {
    const prismaClient = tx || this.prisma;
    const year = new Date().getFullYear();
    const prefix = `FK-${year}-`;

    let orders: any[] = [];
    try {
      if (typeof prismaClient.order?.findMany === 'function') {
        const res = await prismaClient.order.findMany({
          where: { orderNumber: { startsWith: prefix } },
          select: { orderNumber: true },
        });
        if (Array.isArray(res)) {
          orders = res;
        }
      }
    } catch {
      orders = [];
    }

    if (
      orders.length === 0 &&
      typeof prismaClient.order?.findFirst === 'function'
    ) {
      try {
        const latest = await prismaClient.order.findFirst({
          where: { orderNumber: { startsWith: prefix } },
          orderBy: { orderNumber: 'desc' },
          select: { orderNumber: true },
        });
        if (latest?.orderNumber) {
          orders = [latest];
        }
      } catch {
        // Ignore
      }
    }

    let maxSeq = 0;
    for (const o of orders) {
      if (o?.orderNumber) {
        const match = o.orderNumber.match(/FK-\d{4}-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      }
    }

    let nextSeq = maxSeq + 1;
    let candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;
    if (typeof prismaClient.order?.findFirst === 'function') {
      try {
        while (
          await prismaClient.order.findFirst({
            where: { orderNumber: candidate },
            select: { id: true },
          })
        ) {
          nextSeq++;
          candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;
        }
      } catch {
        // Ignore
      }
    }

    return candidate;
  }

  /**
   * Validates and processes order lines, combinations, options, portion pricing, and MOQ.
   */
  private async processOrderLines(
    linesDto: CreateOrderLineDto[],
    companyId: string,
    tierId: string,
    isAdmin: boolean = false,
  ): Promise<{ lines: ProcessedLine[]; totalCents: number }> {
    if (!linesDto || linesDto.length === 0) {
      throw new BadRequestException('An order must contain at least one line');
    }

    const processedLines: ProcessedLine[] = [];
    let orderTotalCents = 0;

    // Load company hidden items for menu visibility checking
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        hiddenCategories: true,
        hiddenDishes: true,
      },
    });

    const hiddenDishIds = new Set(
      company?.hiddenDishes.map((hd) => hd.dishId) || [],
    );
    const hiddenCategoryIds = new Set(
      company?.hiddenCategories.map((hc) => hc.categoryId) || [],
    );

    for (const lineDto of linesDto) {
      if (lineDto.quantity <= 0) {
        throw new BadRequestException(
          `Dish quantity must be greater than zero`,
        );
      }

      // 1. Load dish and check status & visibility
      const dish = await this.prisma.dish.findUnique({
        where: { id: lineDto.dishId },
        include: {
          categoryItems: {
            include: { category: true },
          },
          optionGroups: {
            include: {
              optionGroup: {
                include: {
                  options: { include: { option: true } },
                  portions: { include: { portionSize: true } },
                },
              },
            },
            orderBy: { displayOrder: 'asc' },
          },
        },
      });

      if (!dish) {
        throw new BadRequestException(
          `Dish with ID '${lineDto.dishId}' not found`,
        );
      }

      if (!dish.isActive && !isAdmin) {
        throw new BadRequestException(
          `Dish '${dish.name}' is inactive and cannot be ordered`,
        );
      }

      // Check if hidden for this company
      if (hiddenDishIds.has(dish.id) && !isAdmin) {
        throw new BadRequestException(
          `Dish '${dish.name}' is not available for this company`,
        );
      }

      // Check active category membership and hidden categories
      const activeCategories = dish.categoryItems.filter(
        (ci) => ci.isActive && ci.category.isActive,
      );
      if (activeCategories.length === 0 && !isAdmin) {
        throw new BadRequestException(
          `Dish '${dish.name}' is not currently available on the active menu`,
        );
      }

      const visibleCategories = activeCategories.filter(
        (ci) => !hiddenCategoryIds.has(ci.categoryId),
      );
      if (visibleCategories.length === 0 && !isAdmin) {
        throw new BadRequestException(
          `Dish '${dish.name}' is not available for this company (category hidden)`,
        );
      }

      // 2. Resolve dish price under tier
      let dishUnitPriceCents = dish.costPriceCents;
      const dishPriceResolution = await this.pricingService.resolveDishPrice(
        dish.id,
        tierId,
      );
      if (dishPriceResolution) {
        dishUnitPriceCents = dishPriceResolution.priceCents;
      } else if (!isAdmin) {
        throw new BadRequestException(
          `Dish '${dish.name}' does not have a valid price for the company price tier`,
        );
      }

      // 3. Validate Minimum Order Quantity (MOQ) on total dish quantity
      if (
        dish.minimumOrderQuantity &&
        lineDto.quantity < dish.minimumOrderQuantity &&
        !isAdmin
      ) {
        throw new BadRequestException(
          `Dish '${dish.name}' requires a minimum order quantity of ${dish.minimumOrderQuantity}, but only ${lineDto.quantity} was requested`,
        );
      }

      // 4. Validate Combinations
      let inputCombinations = lineDto.combinations;
      if (!inputCombinations || inputCombinations.length === 0) {
        // If dish has required option groups, auto-select first available option or require selections
        const requiredGroups = dish.optionGroups.filter(
          (og) => og.optionGroup.isRequired && og.optionGroup.isActive,
        );
        if (requiredGroups.length > 0 && !isAdmin) {
          throw new BadRequestException(
            `Dish '${dish.name}' requires selections for: ${requiredGroups.map((g) => g.optionGroup.name).join(', ')}`,
          );
        }

        // Auto-create single combination with default options for required groups
        const autoOptions: CreateCombinationOptionDto[] = [];
        for (const og of requiredGroups) {
          const firstOpt = og.optionGroup.options.find(
            (o) => o.option?.isActive ?? true,
          );
          if (firstOpt) {
            autoOptions.push({
              optionGroupId: og.optionGroupId,
              optionId: firstOpt.optionId,
            });
          }
        }
        inputCombinations = [
          { quantity: lineDto.quantity, options: autoOptions },
        ];
      }

      // Validate that combinations sum EXACTLY to line.quantity
      const sumCombinationQty = inputCombinations.reduce(
        (sum, c) => sum + c.quantity,
        0,
      );
      if (sumCombinationQty !== lineDto.quantity) {
        throw new BadRequestException(
          `Sum of combination quantities (${sumCombinationQty}) must equal dish quantity (${lineDto.quantity}) for dish '${dish.name}'`,
        );
      }

      // Process and normalize combinations
      const attachedGroupMap = new Map(
        dish.optionGroups.map((og) => [og.optionGroupId, og.optionGroup]),
      );

      const normalizedCombinationsMap = new Map<
        string,
        NormalizedCombination
      >();

      for (const comboDto of inputCombinations) {
        if (comboDto.quantity <= 0) {
          throw new BadRequestException(
            `Combination quantity must be greater than zero`,
          );
        }

        const selectedOptions = comboDto.options || [];

        // Check for multiple selections on the same option group
        const groupSelectedCount = new Map<string, number>();
        for (const opt of selectedOptions) {
          const count = (groupSelectedCount.get(opt.optionGroupId) || 0) + 1;
          if (count > 1) {
            throw new BadRequestException(
              `Multiple options selected for the same option group in dish '${dish.name}'`,
            );
          }
          groupSelectedCount.set(opt.optionGroupId, count);
        }

        // Validate all required option groups are selected
        for (const dog of dish.optionGroups) {
          if (dog.optionGroup.isRequired && dog.optionGroup.isActive) {
            if (!groupSelectedCount.has(dog.optionGroupId)) {
              throw new BadRequestException(
                `Required option group '${dog.optionGroup.name}' must be selected for dish '${dish.name}'`,
              );
            }
          }
        }

        // Validate each selected option
        const processedComboOptions: NormalizedCombination['options'] = [];
        let comboOptionsPriceCents = 0;

        for (const optDto of selectedOptions) {
          const group = attachedGroupMap.get(optDto.optionGroupId);
          if (!group || !group.isActive) {
            throw new BadRequestException(
              `Option group with ID '${optDto.optionGroupId}' is not valid for dish '${dish.name}'`,
            );
          }

          const groupOption = group.options.find(
            (o) => o.optionId === optDto.optionId,
          );
          if (!groupOption || !groupOption.option.isActive) {
            throw new BadRequestException(
              `Option with ID '${optDto.optionId}' is not valid or active for group '${group.name}'`,
            );
          }
          const option = groupOption.option;

          // Resolve option price
          let finalOptionPriceCents = option.costPriceCents || 0;
          const optionPriceRes = await this.pricingService.resolveOptionPrice(
            option.id,
            tierId,
          );
          if (optionPriceRes) {
            finalOptionPriceCents = optionPriceRes.priceCents;
          } else if (!isAdmin) {
            throw new BadRequestException(
              `Option '${option.name}' does not have a valid price for the company price tier`,
            );
          }

          // Check portions if applicable
          let portionNameSnapshot: string | undefined = undefined;
          let portionExtraCents = 0;

          if (optDto.portionSizeId) {
            const portion = group.portions.find(
              (p) => p.portionSizeId === optDto.portionSizeId,
            );
            if (!portion || !portion.portionSize.isActive) {
              throw new BadRequestException(
                `Portion size '${optDto.portionSizeId}' is not valid for group '${group.name}'`,
              );
            }
            portionNameSnapshot = portion.portionSize.name;
            portionExtraCents = portion.extraPriceCents;
          }

          comboOptionsPriceCents += finalOptionPriceCents + portionExtraCents;

          processedComboOptions.push({
            optionId: option.id,
            optionGroupId: group.id,
            optionGroupNameSnapshot: group.name,
            optionNameSnapshot: option.name,
            optionPriceCents: finalOptionPriceCents,
            portionSizeId: optDto.portionSizeId,
            portionNameSnapshot,
            portionExtraCents,
          });
        }

        // Sort options for consistent combination normalization key
        processedComboOptions.sort((a, b) =>
          a.optionGroupId.localeCompare(b.optionGroupId),
        );
        const comboKey = processedComboOptions
          .map(
            (o) =>
              `${o.optionGroupId}:${o.optionId}:${o.portionSizeId || 'none'}`,
          )
          .join('|');

        const comboUnitPriceCents = dishUnitPriceCents + comboOptionsPriceCents;

        if (normalizedCombinationsMap.has(comboKey)) {
          // Merge identical combinations
          const existing = normalizedCombinationsMap.get(comboKey)!;
          existing.quantity += comboDto.quantity;
          existing.combinationTotalCents =
            existing.unitPriceCents * existing.quantity;
        } else {
          normalizedCombinationsMap.set(comboKey, {
            quantity: comboDto.quantity,
            unitPriceCents: comboUnitPriceCents,
            combinationTotalCents: comboUnitPriceCents * comboDto.quantity,
            options: processedComboOptions,
          });
        }
      }

      const combinations = Array.from(normalizedCombinationsMap.values());
      const lineTotalCents = combinations.reduce(
        (sum, c) => sum + c.combinationTotalCents,
        0,
      );
      orderTotalCents += lineTotalCents;

      processedLines.push({
        dishId: dish.id,
        dishNameSnapshot: dish.name,
        dishSkuSnapshot: dish.sku,
        dishUnitPriceCents,
        quantity: lineDto.quantity,
        lineTotalCents,
        combinations,
      });
    }

    return {
      lines: processedLines,
      totalCents: orderTotalCents,
    };
  }

  // ===========================================================================
  // ORDER CREATION
  // ===========================================================================

  async create(dto: CreateOrderDto, currentUserId?: string) {
    // 1. Load employee and company
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      include: {
        company: {
          include: {
            addresses: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(
        `Employee with ID '${dto.employeeId}' not found`,
      );
    }

    if (!employee.isActive) {
      throw new BadRequestException(
        `Employee '${employee.firstName} ${employee.lastName}' is inactive`,
      );
    }

    const company = employee.company;
    const companyId = company.id;

    // Check if requester is Admin or has bypass permission
    const currentUser = currentUserId
      ? await this.prisma.user.findUnique({
          where: { id: currentUserId },
          include: { role: true },
        })
      : null;
    const isAdmin = currentUser?.role?.name === 'ADMIN';
    const canBypassCutoff = isAdmin || dto.bypassCutoff === true;
    const canBypassCalendar = isAdmin || dto.bypassCalendar === true;

    // 2. Validate Company Delivery Calendar (working day and company holiday)
    const deliveryCheck = await this.companiesService.isDeliveryDay(
      companyId,
      dto.deliveryDate,
    );
    if (!deliveryCheck.canDeliver && !canBypassCalendar) {
      throw new BadRequestException(
        `Company cannot receive delivery on ${dto.deliveryDate}: ${deliveryCheck.reason}`,
      );
    }

    // 3. Validate Kitchen Cutoff
    const cutoffInfo = await this.cutoffService.calculateOrderCutoff(
      dto.deliveryDate,
    );
    const now = new Date();
    const isPastCutoff = now.getTime() >= cutoffInfo.cutoffDateTime.getTime();

    const isPlaced = dto.isPlaced === true || dto.status === OrderStatus.PLACED;

    if (isPastCutoff && !canBypassCutoff) {
      throw new BadRequestException(
        `Order cutoff for delivery date ${dto.deliveryDate} passed at ${cutoffInfo.cutoffDateTime.toISOString()} (Asia/Kolkata)`,
      );
    }

    // 4. Validate Delivery Address and Employee Permissions
    let selectedAddressId: string;
    const reqAddressId = dto.companyAddressId || dto.deliveryAddressId;
    if (reqAddressId) {
      // Permission check: can employee choose address? (Only enforced for non-admin employee self-service)
      if (!isAdmin && !employee.canChooseDeliveryAddress) {
        const allowedDefault =
          employee.defaultDeliveryAddressId || company.addresses[0]?.id;
        if (reqAddressId !== allowedDefault) {
          throw new BadRequestException(
            `Employee does not have permission to choose a custom delivery address`,
          );
        }
      }

      const addr = company.addresses.find(
        (a) => a.id === reqAddressId && a.isActive,
      );
      if (!addr) {
        throw new BadRequestException(
          `Delivery address with ID '${reqAddressId}' does not belong to employee's company or is inactive`,
        );
      }
      selectedAddressId = addr.id;
    } else {
      // Use employee default or first active company address
      const addr =
        company.addresses.find(
          (a) => a.id === employee.defaultDeliveryAddressId && a.isActive,
        ) || company.addresses.find((a) => a.isActive);

      if (!addr) {
        throw new BadRequestException(
          `No active delivery address found for company '${company.name}'`,
        );
      }
      selectedAddressId = addr.id;
    }

    const selectedAddress = company.addresses.find(
      (a) => a.id === selectedAddressId,
    )!;

    // 5. Validate Delivery Time and Employee Permissions
    let selectedDeliveryTimeMinutes: number;
    const defaultTime =
      employee.defaultDeliveryTimeMinutes ?? company.defaultDeliveryTimeMinutes;

    if (dto.deliveryTimeMinutes !== undefined) {
      if (
        !isAdmin &&
        !employee.canChangeDeliveryTime &&
        dto.deliveryTimeMinutes !== defaultTime
      ) {
        throw new BadRequestException(
          `Employee does not have permission to change delivery time`,
        );
      }
      if (dto.deliveryTimeMinutes < 0 || dto.deliveryTimeMinutes > 1439) {
        throw new BadRequestException(
          `Delivery time must be between 0 and 1439 minutes`,
        );
      }
      selectedDeliveryTimeMinutes = dto.deliveryTimeMinutes;
    } else {
      selectedDeliveryTimeMinutes = defaultTime;
    }

    // 6. Validate Packaging and Employee Permissions
    let selectedPackagingId: string;
    const defaultPackaging =
      employee.defaultPackagingTypeId || company.defaultPackagingTypeId;

    if (dto.packagingTypeId) {
      if (
        !isAdmin &&
        !employee.canChangePackaging &&
        dto.packagingTypeId !== defaultPackaging
      ) {
        throw new BadRequestException(
          `Employee does not have permission to change packaging type`,
        );
      }
      const packaging = await this.prisma.packagingType.findUnique({
        where: { id: dto.packagingTypeId },
      });
      if (!packaging || !packaging.isActive) {
        throw new BadRequestException(
          `Packaging type with ID '${dto.packagingTypeId}' not found or inactive`,
        );
      }
      selectedPackagingId = packaging.id;
    } else {
      selectedPackagingId = defaultPackaging;
    }

    const packagingRecord = await this.prisma.packagingType.findUnique({
      where: { id: selectedPackagingId },
    });
    if (!packagingRecord) {
      throw new BadRequestException(
        `Default packaging type not found for company`,
      );
    }

    // 7. Resolve Price Tier
    let priceTierId = company.priceTierId;
    if (!priceTierId) {
      const defaultTier = await this.prisma.priceTier.findFirst({
        where: { isDefault: true },
      });
      if (!defaultTier) {
        throw new BadRequestException('No default price tier configured');
      }
      priceTierId = defaultTier.id;
    }

    // 8. Process Order Lines, Combinations & Pricing
    const { lines: processedLines, totalCents } = await this.processOrderLines(
      dto.lines,
      companyId,
      priceTierId,
      isAdmin,
    );

    // 9. Planned Kitchen & Dispatch Timing Calculations
    // deliveryDateTime in Asia/Kolkata
    const normalizedDeliveryDate = this.cutoffService.normalizeCalendarDate(
      dto.deliveryDate,
    );
    const deliveryUtc = this.cutoffService.combineDateAndTimeInTimezone(
      normalizedDeliveryDate,
      selectedDeliveryTimeMinutes,
    );

    const plannedDispatchReadyAt = new Date(
      deliveryUtc.getTime() - company.deliveryMinutesBefore * 60 * 1000,
    );
    const plannedKitchenReadyAt = new Date(
      plannedDispatchReadyAt.getTime() - 30 * 60 * 1000,
    );

    // 10. Transactional Creation
    return this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.generateOrderNumber(tx);
      const initialStatus = isPlaced ? OrderStatus.PLACED : OrderStatus.DRAFT;

      const order = await tx.order.create({
        data: {
          orderNumber,
          employeeId: employee.id,
          companyId: company.id, // Snapshot historical company ID
          deliveryDate: normalizedDeliveryDate,
          deliveryTimeMinutes: selectedDeliveryTimeMinutes,
          packagingTypeId: selectedPackagingId,
          status: initialStatus,
          totalCents,
          placedAt: isPlaced ? now : null,
          notes: dto.notes?.trim() || null,
          plannedDispatchReadyAt,
          plannedKitchenReadyAt,
          delivery: {
            create: {
              companyAddressId: selectedAddress.id,
              addressLabelSnapshot: selectedAddress.label,
              addressLine1Snapshot: selectedAddress.addressLine1,
              addressLine2Snapshot: selectedAddress.addressLine2,
              citySnapshot: selectedAddress.city,
              stateSnapshot: selectedAddress.state,
              postalCodeSnapshot: selectedAddress.postalCode,
              deliveryTimeMinutes: selectedDeliveryTimeMinutes,
              packagingNameSnapshot: packagingRecord.name,
              deliveryInstructionsSnapshot: company.driverInstructions,
            },
          },
        },
      });

      // Create lines, combinations, and options
      for (const line of processedLines) {
        const createdLine = await tx.orderLine.create({
          data: {
            orderId: order.id,
            dishId: line.dishId,
            dishNameSnapshot: line.dishNameSnapshot,
            dishSkuSnapshot: line.dishSkuSnapshot,
            dishUnitPriceCents: line.dishUnitPriceCents,
            quantity: line.quantity,
            lineTotalCents: line.lineTotalCents,
          },
        });

        for (const combo of line.combinations) {
          const createdCombo = await tx.orderCombination.create({
            data: {
              orderLineId: createdLine.id,
              quantity: combo.quantity,
              unitPriceCents: combo.unitPriceCents,
              combinationTotalCents: combo.combinationTotalCents,
            },
          });

          if (combo.options.length > 0) {
            await tx.combinationOption.createMany({
              data: combo.options.map((opt) => ({
                combinationId: createdCombo.id,
                optionId: opt.optionId,
                optionGroupId: opt.optionGroupId,
                optionGroupNameSnapshot: opt.optionGroupNameSnapshot,
                optionNameSnapshot: opt.optionNameSnapshot,
                optionPriceCents: opt.optionPriceCents,
                portionSizeId: opt.portionSizeId,
                portionNameSnapshot: opt.portionNameSnapshot,
                portionExtraCents: opt.portionExtraCents,
              })),
            });
          }
        }
      }

      // Record OrderEvent
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          userId: currentUserId || null,
          type: isPlaced
            ? OrderEventType.ORDER_PLACED
            : OrderEventType.ORDER_CREATED,
          note: isPlaced
            ? `Order placed with ${processedLines.length} line(s)`
            : `Draft order created with ${processedLines.length} line(s)`,
          metadata: {
            orderNumber,
            totalCents,
            deliveryDate: dto.deliveryDate,
          },
        },
      });

      return tx.order.findUnique({
        where: { id: order.id },
        include: {
          company: true,
          employee: true,
          packagingType: true,
          delivery: true,
          lines: {
            include: {
              combinations: {
                include: { options: true },
              },
            },
          },
          events: { orderBy: { occurredAt: 'asc' } },
        },
      });
    });
  }

  // ===========================================================================
  // ORDER EDITING (BEFORE CUTOFF)
  // ===========================================================================

  async update(id: string, dto: UpdateOrderDto, currentUserId?: string) {
    const currentUser = currentUserId
      ? await this.prisma.user.findUnique({
          where: { id: currentUserId },
          include: { role: true },
        })
      : null;
    const isAdmin = currentUser?.role?.name === 'ADMIN';

    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        employee: true,
        company: { include: { addresses: true } },
        delivery: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID '${id}' not found`);
    }

    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REJECTED ||
      order.status === OrderStatus.DELIVERED
    ) {
      throw new BadRequestException(
        `Cannot edit an order in ${order.status} status`,
      );
    }

    if (order.status === OrderStatus.CONFIRMED) {
      throw new BadRequestException(
        `Cannot edit confirmed order; use admin override for delivery details`,
      );
    }

    if (!isAdmin) {
      // Check cutoff for current delivery date
      const currentCutoff = await this.cutoffService.calculateOrderCutoff(
        order.deliveryDate,
      );
      if (new Date().getTime() >= currentCutoff.cutoffDateTime.getTime()) {
        throw new BadRequestException(
          `Cannot edit order: cutoff has already passed at ${currentCutoff.cutoffDateTime.toISOString()}`,
        );
      }
    }

    const employee = order.employee;
    const company = order.company;

    // Delivery date update
    let newDeliveryDate = order.deliveryDate;
    if (dto.deliveryDate) {
      const deliveryCheck = await this.companiesService.isDeliveryDay(
        company.id,
        dto.deliveryDate,
      );
      if (!deliveryCheck.canDeliver) {
        throw new BadRequestException(
          `Company cannot receive delivery on ${dto.deliveryDate}: ${deliveryCheck.reason}`,
        );
      }

      const newCutoff = await this.cutoffService.calculateOrderCutoff(
        dto.deliveryDate,
      );
      if (new Date().getTime() >= newCutoff.cutoffDateTime.getTime()) {
        throw new BadRequestException(
          `Cannot change to delivery date ${dto.deliveryDate}: cutoff has already passed`,
        );
      }
      newDeliveryDate = this.cutoffService.normalizeCalendarDate(
        dto.deliveryDate,
      );
    }

    // Address update
    let updatedAddressId = order.delivery?.companyAddressId;
    let selectedAddress = company.addresses.find(
      (a) => a.id === updatedAddressId,
    );

    const reqAddressId = dto.companyAddressId || dto.deliveryAddressId;
    if (reqAddressId && reqAddressId !== updatedAddressId) {
      if (!isAdmin && !employee.canChooseDeliveryAddress) {
        throw new BadRequestException(
          `Employee does not have permission to choose a custom delivery address`,
        );
      }
      selectedAddress = company.addresses.find(
        (a) => a.id === reqAddressId && a.isActive,
      );
      if (!selectedAddress) {
        throw new BadRequestException(
          `Delivery address '${reqAddressId}' does not belong to company or is inactive`,
        );
      }
      updatedAddressId = selectedAddress.id;
    }

    // Delivery time update
    let updatedDeliveryTimeMinutes = order.deliveryTimeMinutes;
    if (
      dto.deliveryTimeMinutes !== undefined &&
      dto.deliveryTimeMinutes !== order.deliveryTimeMinutes
    ) {
      if (!isAdmin && !employee.canChangeDeliveryTime) {
        throw new BadRequestException(
          `Employee does not have permission to change delivery time`,
        );
      }
      if (dto.deliveryTimeMinutes < 0 || dto.deliveryTimeMinutes > 1439) {
        throw new BadRequestException(
          `Delivery time must be between 0 and 1439 minutes`,
        );
      }
      updatedDeliveryTimeMinutes = dto.deliveryTimeMinutes;
    }

    // Packaging update
    let updatedPackagingId = order.packagingTypeId;
    let packagingRecord = await this.prisma.packagingType.findUnique({
      where: { id: updatedPackagingId },
    });

    if (dto.packagingTypeId && dto.packagingTypeId !== updatedPackagingId) {
      if (!isAdmin && !employee.canChangePackaging) {
        throw new BadRequestException(
          `Employee does not have permission to change packaging type`,
        );
      }
      const pkg = await this.prisma.packagingType.findUnique({
        where: { id: dto.packagingTypeId },
      });
      if (!pkg || !pkg.isActive) {
        throw new BadRequestException(
          `Packaging type '${dto.packagingTypeId}' not found or inactive`,
        );
      }
      updatedPackagingId = pkg.id;
      packagingRecord = pkg;
    }

    // Resolve Price Tier
    let priceTierId = company.priceTierId;
    if (!priceTierId) {
      const defaultTier = await this.prisma.priceTier.findFirst({
        where: { isDefault: true },
      });
      priceTierId = defaultTier!.id;
    }

    // Recalculate lines if provided
    let newTotalCents = order.totalCents;
    let processedLines: ProcessedLine[] | null = null;

    if (dto.lines && dto.lines.length > 0) {
      const res = await this.processOrderLines(
        dto.lines,
        company.id,
        priceTierId,
        isAdmin,
      );
      processedLines = res.lines;
      newTotalCents = res.totalCents;
    }

    // Recalculate planned timing
    const deliveryUtc = this.cutoffService.combineDateAndTimeInTimezone(
      newDeliveryDate,
      updatedDeliveryTimeMinutes,
    );
    const plannedDispatchReadyAt = new Date(
      deliveryUtc.getTime() - company.deliveryMinutesBefore * 60 * 1000,
    );
    const plannedKitchenReadyAt = new Date(
      plannedDispatchReadyAt.getTime() - 30 * 60 * 1000,
    );

    return this.prisma.$transaction(async (tx) => {
      // If lines updated, remove old lines & combinations and re-insert
      if (processedLines) {
        await tx.orderLine.deleteMany({ where: { orderId: id } });

        for (const line of processedLines) {
          const createdLine = await tx.orderLine.create({
            data: {
              orderId: id,
              dishId: line.dishId,
              dishNameSnapshot: line.dishNameSnapshot,
              dishSkuSnapshot: line.dishSkuSnapshot,
              dishUnitPriceCents: line.dishUnitPriceCents,
              quantity: line.quantity,
              lineTotalCents: line.lineTotalCents,
            },
          });

          for (const combo of line.combinations) {
            const createdCombo = await tx.orderCombination.create({
              data: {
                orderLineId: createdLine.id,
                quantity: combo.quantity,
                unitPriceCents: combo.unitPriceCents,
                combinationTotalCents: combo.combinationTotalCents,
              },
            });

            if (combo.options.length > 0) {
              await tx.combinationOption.createMany({
                data: combo.options.map((opt) => ({
                  combinationId: createdCombo.id,
                  optionId: opt.optionId,
                  optionGroupId: opt.optionGroupId,
                  optionGroupNameSnapshot: opt.optionGroupNameSnapshot,
                  optionNameSnapshot: opt.optionNameSnapshot,
                  optionPriceCents: opt.optionPriceCents,
                  portionSizeId: opt.portionSizeId,
                  portionNameSnapshot: opt.portionNameSnapshot,
                  portionExtraCents: opt.portionExtraCents,
                })),
              });
            }
          }
        }
      }

      // Update Order & OrderDelivery
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          deliveryDate: newDeliveryDate,
          deliveryTimeMinutes: updatedDeliveryTimeMinutes,
          packagingTypeId: updatedPackagingId,
          totalCents: newTotalCents,
          notes:
            dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
          plannedDispatchReadyAt,
          plannedKitchenReadyAt,
          delivery: {
            update: {
              companyAddressId: updatedAddressId,
              addressLabelSnapshot: selectedAddress?.label,
              addressLine1Snapshot: selectedAddress?.addressLine1,
              addressLine2Snapshot: selectedAddress?.addressLine2,
              citySnapshot: selectedAddress?.city,
              stateSnapshot: selectedAddress?.state,
              postalCodeSnapshot: selectedAddress?.postalCode,
              deliveryTimeMinutes: updatedDeliveryTimeMinutes,
              packagingNameSnapshot: packagingRecord?.name,
            },
          },
        },
        include: {
          delivery: true,
          lines: {
            include: {
              combinations: { include: { options: true } },
            },
          },
          events: { orderBy: { occurredAt: 'asc' } },
        },
      });

      // Record update event
      await tx.orderEvent.create({
        data: {
          orderId: id,
          userId: currentUserId || null,
          type: OrderEventType.ORDER_CREATED,
          note: 'Order details modified before cutoff',
          metadata: {
            deliveryDate: dto.deliveryDate,
            totalCents: newTotalCents,
          },
        },
      });

      return updatedOrder;
    });
  }

  // ===========================================================================
  // ORDER PLACEMENT
  // ===========================================================================

  async place(id: string, currentUserId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID '${id}' not found`);
    }

    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        `Only DRAFT orders can be placed (current status: ${order.status})`,
      );
    }

    let isAdmin = false;
    if (currentUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        include: { role: true },
      });
      if (user?.role?.name === 'ADMIN') {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      // Cutoff check
      const cutoff = await this.cutoffService.calculateOrderCutoff(
        order.deliveryDate,
      );
      if (new Date().getTime() >= cutoff.cutoffDateTime.getTime()) {
        throw new BadRequestException(
          `Cannot place order: cutoff has already passed at ${cutoff.cutoffDateTime.toISOString()}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.PLACED,
          placedAt: now,
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: id,
          userId: currentUserId || null,
          type: OrderEventType.ORDER_PLACED,
          note: `Order ${order.orderNumber} placed`,
          occurredAt: now,
        },
      });

      return updated;
    });
  }

  // ===========================================================================
  // ORDER CANCELLATION
  // ===========================================================================

  async cancel(
    id: string,
    dto: CancelOrderDto,
    currentUserId?: string,
    isAdmin = false,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID '${id}' not found`);
    }

    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REJECTED ||
      order.status === OrderStatus.DELIVERED
    ) {
      throw new BadRequestException(
        `Order cannot be cancelled in status ${order.status}`,
      );
    }

    // Before cutoff check (unless admin)
    if (!isAdmin) {
      if (order.status === OrderStatus.CONFIRMED) {
        throw new BadRequestException(
          `Confirmed orders cannot be cancelled by standard users after cutoff`,
        );
      }

      const cutoff = await this.cutoffService.calculateOrderCutoff(
        order.deliveryDate,
      );
      if (new Date().getTime() >= cutoff.cutoffDateTime.getTime()) {
        throw new BadRequestException(
          `Cannot cancel order: cutoff has passed at ${cutoff.cutoffDateTime.toISOString()}`,
        );
      }
    }

    const now = new Date();
    const reason = dto?.reason?.trim() || 'Cancelled by user';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: reason,
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: id,
          userId: currentUserId || null,
          type: OrderEventType.ORDER_CANCELLED,
          note: `Order cancelled: ${reason}`,
          metadata: { reason },
          occurredAt: now,
        },
      });

      return updated;
    });
  }

  // ===========================================================================
  // ADMIN OVERRIDE
  // ===========================================================================

  async adminOverride(id: string, dto: AdminOverrideDto, adminUserId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        company: { include: { addresses: true } },
        delivery: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID '${id}' not found`);
    }

    const company = order.company;
    const previous = {
      deliveryAddressId: order.delivery?.companyAddressId,
      deliveryTimeMinutes: order.deliveryTimeMinutes,
      packagingTypeId: order.packagingTypeId,
    };

    const changes: Record<string, any> = {};

    // 1. Override Address
    let newAddress = company.addresses.find(
      (a) => a.id === order.delivery?.companyAddressId,
    );
    const reqAddressId = dto.deliveryAddressId || dto.companyAddressId;
    if (reqAddressId) {
      newAddress = company.addresses.find(
        (a) => a.id === reqAddressId && a.isActive,
      );
      if (!newAddress) {
        throw new BadRequestException(
          `Delivery address '${reqAddressId}' does not belong to company or is inactive`,
        );
      }
      changes.deliveryAddressId = reqAddressId;
    }

    // 2. Override Delivery Time
    let newDeliveryTime = order.deliveryTimeMinutes;
    if (dto.deliveryTimeMinutes !== undefined) {
      if (dto.deliveryTimeMinutes < 0 || dto.deliveryTimeMinutes > 1439) {
        throw new BadRequestException(
          `Delivery time must be between 0 and 1439 minutes`,
        );
      }
      newDeliveryTime = dto.deliveryTimeMinutes;
      changes.deliveryTimeMinutes = newDeliveryTime;
    }

    // 3. Override Packaging
    let newPackagingId = order.packagingTypeId;
    let packagingRecord = await this.prisma.packagingType.findUnique({
      where: { id: newPackagingId },
    });
    if (dto.packagingTypeId) {
      const pkg = await this.prisma.packagingType.findUnique({
        where: { id: dto.packagingTypeId },
      });
      if (!pkg || !pkg.isActive) {
        throw new BadRequestException(
          `Packaging type '${dto.packagingTypeId}' not found or is inactive`,
        );
      }
      newPackagingId = pkg.id;
      packagingRecord = pkg;
      changes.packagingTypeId = newPackagingId;
    }

    // Recalculate planned timing
    const deliveryUtc = this.cutoffService.combineDateAndTimeInTimezone(
      order.deliveryDate,
      newDeliveryTime,
    );
    const plannedDispatchReadyAt = new Date(
      deliveryUtc.getTime() - company.deliveryMinutesBefore * 60 * 1000,
    );
    const plannedKitchenReadyAt = new Date(
      plannedDispatchReadyAt.getTime() - 30 * 60 * 1000,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          deliveryTimeMinutes: newDeliveryTime,
          packagingTypeId: newPackagingId,
          plannedDispatchReadyAt,
          plannedKitchenReadyAt,
          delivery: {
            update: {
              companyAddressId: newAddress?.id,
              addressLabelSnapshot: newAddress?.label,
              addressLine1Snapshot: newAddress?.addressLine1,
              addressLine2Snapshot: newAddress?.addressLine2,
              citySnapshot: newAddress?.city,
              stateSnapshot: newAddress?.state,
              postalCodeSnapshot: newAddress?.postalCode,
              deliveryTimeMinutes: newDeliveryTime,
              packagingNameSnapshot: packagingRecord?.name,
            },
          },
        },
        include: {
          delivery: true,
          lines: {
            include: {
              combinations: { include: { options: true } },
            },
          },
          events: { orderBy: { occurredAt: 'asc' } },
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: id,
          userId: adminUserId,
          type: OrderEventType.ADMIN_OVERRIDE,
          note: dto.note,
          metadata: {
            previous,
            overrides: changes,
            adminUserId,
          },
        },
      });

      return updated;
    });

    if (
      this.dispatchService &&
      (dto.companyAddressId || dto.deliveryTimeMinutes !== undefined)
    ) {
      await this.dispatchService.reconcileOrderDrop(id);
    }

    return result;
  }

  // ===========================================================================
  // CUTOFF PROCESSING (IDEMPOTENT BATCH RUNNER)
  // ===========================================================================

  /**
   * Processes all active orders whose kitchen cutoff has passed:
   * DRAFT  -> CANCELLED (unplaced drafts are automatically cancelled)
   * PLACED -> CONFIRMED (placed orders are locked and confirmed for kitchen production)
   * Safe, transactional, and 100% idempotent.
   */
  async processCutoffs(
    referenceTime: Date = new Date(),
    currentUserId?: string,
  ) {
    const candidateOrders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.DRAFT, OrderStatus.PLACED] },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        deliveryDate: true,
      },
    });

    const examinedCount = candidateOrders.length;
    let confirmedCount = 0;
    let cancelledDraftsCount = 0;
    let skippedCount = 0;

    for (const order of candidateOrders) {
      const cutoff = await this.cutoffService.calculateOrderCutoff(
        order.deliveryDate,
      );

      // Has cutoff passed?
      if (referenceTime.getTime() >= cutoff.cutoffDateTime.getTime()) {
        if (order.status === OrderStatus.PLACED) {
          // Atomic update ensures idempotency and concurrent safety
          const result = await this.prisma.order.updateMany({
            where: {
              id: order.id,
              status: OrderStatus.PLACED,
            },
            data: {
              status: OrderStatus.CONFIRMED,
              confirmedAt: referenceTime,
            },
          });

          if (result.count > 0) {
            confirmedCount++;
            if (this.kitchenService) {
              await this.kitchenService.ensureKitchenUnitsForOrder(order.id);
            }
            await this.prisma.orderEvent.create({
              data: {
                orderId: order.id,
                userId: currentUserId || null,
                type: OrderEventType.ORDER_CONFIRMED,
                note: `Order ${order.orderNumber} confirmed automatically at kitchen cutoff`,
                metadata: {
                  cutoffDateTime: cutoff.cutoffDateTime.toISOString(),
                  processedAt: referenceTime.toISOString(),
                },
                occurredAt: referenceTime,
              },
            });
          } else {
            skippedCount++;
          }
        } else if (order.status === OrderStatus.DRAFT) {
          const reason =
            'Automatic cancellation: Draft was not placed prior to kitchen cutoff';
          const result = await this.prisma.order.updateMany({
            where: {
              id: order.id,
              status: OrderStatus.DRAFT,
            },
            data: {
              status: OrderStatus.CANCELLED,
              cancelledAt: referenceTime,
              cancellationReason: reason,
            },
          });

          if (result.count > 0) {
            cancelledDraftsCount++;
            await this.prisma.orderEvent.create({
              data: {
                orderId: order.id,
                userId: currentUserId || null,
                type: OrderEventType.ORDER_CANCELLED,
                note: reason,
                metadata: {
                  cutoffDateTime: cutoff.cutoffDateTime.toISOString(),
                  processedAt: referenceTime.toISOString(),
                },
                occurredAt: referenceTime,
              },
            });
          } else {
            skippedCount++;
          }
        }
      } else {
        skippedCount++;
      }
    }

    return {
      examinedCount,
      confirmedCount,
      cancelledDraftsCount,
      skippedCount,
      timestamp: referenceTime.toISOString(),
    };
  }

  // ===========================================================================
  // SEARCH / PAGINATION / DETAIL / TIMELINE
  // ===========================================================================

  async findAll(query: QueryOrderDto) {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.deliveryDate) {
      where.deliveryDate = this.cutoffService.normalizeCalendarDate(
        query.deliveryDate,
      );
    } else if (query.startDate || query.endDate) {
      where.deliveryDate = {};
      if (query.startDate) {
        where.deliveryDate.gte = this.cutoffService.normalizeCalendarDate(
          query.startDate,
        );
      }
      if (query.endDate) {
        where.deliveryDate.lte = this.cutoffService.normalizeCalendarDate(
          query.endDate,
        );
      }
    }

    if (query.isInvoiced !== undefined) {
      where.invoiceEntry = query.isInvoiced ? { isNot: null } : { is: null };
    }

    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { orderNumber: { contains: s, mode: 'insensitive' } },
        {
          employee: {
            OR: [
              { firstName: { contains: s, mode: 'insensitive' } },
              { lastName: { contains: s, mode: 'insensitive' } },
              { email: { contains: s, mode: 'insensitive' } },
            ],
          },
        },
        { company: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const orderBy: Prisma.OrderOrderByWithRelationInput = {};
    if (query.sortBy === 'totalCents') {
      orderBy.totalCents = query.sortOrder || 'desc';
    } else if (query.sortBy === 'createdAt') {
      orderBy.createdAt = query.sortOrder || 'desc';
    } else {
      orderBy.deliveryDate = query.sortOrder || 'desc';
    }

    const [total, items] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          company: { select: { id: true, name: true } },
          employee: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          packagingType: { select: { id: true, name: true } },
          delivery: true,
          invoiceEntry: {
            select: {
              invoiceId: true,
              invoicedAmountCents: true,
              invoice: { select: { invoiceNumber: true, status: true } },
            },
          },
          _count: {
            select: { lines: true, kitchenUnits: true },
          },
        },
      }),
    ]);

    return {
      items,
      orders: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        company: true,
        employee: true,
        packagingType: true,
        delivery: true,
        lines: {
          include: {
            dish: {
              select: {
                id: true,
                sku: true,
                name: true,
                temperature: true,
                kitchenStation: true,
              },
            },
            combinations: {
              include: {
                options: {
                  include: {
                    option: true,
                    optionGroup: true,
                    portionSize: true,
                  },
                },
                kitchenUnit: true,
              },
            },
          },
        },
        events: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { occurredAt: 'asc' },
        },
        invoiceEntry: {
          include: { invoice: true },
        },
        dropOrder: {
          include: { drop: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID '${id}' not found`);
    }

    return order;
  }

  async getOrderTimeline(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID '${id}' not found`);
    }

    return this.prisma.orderEvent.findMany({
      where: { orderId: id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { occurredAt: 'asc' },
    });
  }
}
