'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Truck,
  FileText,
  Building2,
  Settings as SettingsIcon,
  LogOut,
  User,
  Users,
  Coffee,
  DollarSign,
  Package,
} from 'lucide-react';

export function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const role = user.roleName;

  const adminLinks = [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard },
    { href: '/admin/orders', label: 'Orders', icon: Package },
    { href: '/kitchen', label: 'Kitchen Board', icon: UtensilsCrossed },
    { href: '/dispatch', label: 'Dispatch Drops', icon: Truck },
    { href: '/admin/billing', label: 'Billing', icon: FileText },
    { href: '/admin/catalogue', label: 'Catalogue & Menu', icon: Coffee },
    { href: '/admin/pricing', label: 'Pricing', icon: DollarSign },
    { href: '/admin/companies', label: 'Companies', icon: Building2 },
    { href: '/admin/employees', label: 'Employees', icon: Users },
    { href: '/admin/settings', label: 'Settings', icon: SettingsIcon },
  ];

  const kitchenLinks = [
    { href: '/kitchen', label: 'Kitchen Board', icon: UtensilsCrossed },
    { href: '/kitchen/dashboard', label: 'Kitchen Overview', icon: LayoutDashboard },
  ];

  const dispatchLinks = [
    { href: '/dispatch', label: 'Dispatch Drops', icon: Truck },
    { href: '/dispatch/dashboard', label: 'Dispatch Overview', icon: LayoutDashboard },
  ];

  const driverLinks = [
    { href: '/driver', label: 'My Deliveries Today', icon: Truck },
    { href: '/driver/dashboard', label: 'Driver Summary', icon: LayoutDashboard },
  ];

  let navLinks = adminLinks;
  if (role === 'KITCHEN') navLinks = kitchenLinks;
  else if (role === 'DISPATCH') navLinks = dispatchLinks;
  else if (role === 'DRIVER') navLinks = driverLinks;

  return (
    <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2">
              <span className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white text-lg shadow">
                🌿
              </span>
              <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight text-white">Fernleaf Kitchen</span>
                <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                  Operations Panel
                </span>
              </div>
            </Link>
          </div>

          {/* Role Nav Links */}
          <nav className="hidden md:flex space-x-1 items-center">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User & Role Badge & Logout */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 pl-3 border-l border-slate-700 text-xs">
              <div className="flex flex-col items-end">
                <span className="font-medium text-slate-200">{user.name}</span>
                <span className="text-[10px] text-slate-400">{user.email}</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${
                  role === 'ADMIN'
                    ? 'bg-purple-900/60 text-purple-300 border border-purple-600'
                    : role === 'KITCHEN'
                    ? 'bg-amber-900/60 text-amber-300 border border-amber-600'
                    : role === 'DISPATCH'
                    ? 'bg-blue-900/60 text-blue-300 border border-blue-600'
                    : 'bg-emerald-900/60 text-emerald-300 border border-emerald-600'
                }`}
              >
                {role}
              </span>
            </div>

            <button
              onClick={logout}
              title="Sign out"
              className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Scrollable Nav */}
      <div className="md:hidden flex overflow-x-auto px-4 py-2 border-t border-slate-800 space-x-1 text-xs bg-slate-950">
        {navLinks.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded whitespace-nowrap ${
                isActive ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-3 w-3" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
