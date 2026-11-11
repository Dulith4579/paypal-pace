"use client";

import { useState } from "react";
import {
  Zap,
  Bell,
  ChevronDown,
  Menu,
  X,
  Target,
  FlaskConical,
  BarChart3,
  Settings,
  User,
  ShoppingBag,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

interface NavbarProps {
  onNavigate?: (section: string) => void;
  activeSection?: string;
}

// Section ids are kept stable (dashboard / goals / checkout); labels describe each tab's job.
const navItems = [
  { id: "dashboard", label: "Overview", icon: BarChart3 },
  { id: "goals", label: "Goals & Savings", icon: Target },
  { id: "checkout", label: "Agent Lab", icon: FlaskConical },
];

export default function Navbar({ onNavigate, activeSection = "dashboard" }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationCount] = useState(3);

  return (
    <header className="sticky top-0 z-50 glass" style={{ borderBottom: "1px solid var(--border-default)" }}>
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg gradient-paypal"
              style={{ boxShadow: "0 0 12px rgba(0, 112, 186, 0.25)" }}
            >
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold leading-tight tracking-tight" style={{ color: "var(--brand-text)" }}>
                PayPal <span style={{ color: "var(--accent-text)" }}>Pace</span>
              </span>
              <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                AI Financial Co-Pilot
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id}`}
                  onClick={() => onNavigate?.(item.id)}
                  className="btn btn-ghost btn-sm"
                  style={{
                    background: isActive ? "var(--paypal-blue)" : "transparent",
                    color: isActive ? "#ffffff" : "var(--text-secondary)",
                    border: isActive ? "none" : "1px solid transparent",
                    borderRadius: "var(--radius-md)",
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
            <Link
              id="nav-store"
              href="/store"
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", marginLeft: 4 }}
            >
              <ShoppingBag className="w-4 h-4" />
              Store
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {/* Notifications */}
            <button
              id="nav-notifications"
              className="relative p-2 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
              {notificationCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-[18px] h-[18px] text-[10px] font-bold text-white rounded-full"
                  style={{ background: "var(--danger)" }}
                >
                  {notificationCount}
                </span>
              )}
            </button>

            {/* User Menu */}
            <button
              id="nav-user-menu"
              className="hidden sm:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10"
            >
              <div
                className="w-8 h-8 rounded-full gradient-paypal flex items-center justify-center"
              >
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-semibold leading-tight">Demo User</span>
                <span className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
                  Sandbox Mode
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
            </button>

            {/* Settings (desktop) */}
            <button
              id="nav-settings"
              className="hidden lg:flex p-2 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
            </button>

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden p-2 rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" style={{ color: "var(--text-primary)" }} />
              ) : (
                <Menu className="w-5 h-5" style={{ color: "var(--text-primary)" }} />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav
            className="md:hidden py-3 animate-slide-in-down"
            style={{ borderTop: "1px solid var(--border-default)" }}
          >
            <div className="flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate?.(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left"
                    style={{
                      background: isActive ? "rgba(0, 112, 186, 0.08)" : "transparent",
                      color: isActive ? "var(--paypal-blue)" : "var(--text-secondary)",
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm">{item.label}</span>
                  </button>
                );
              })}
              <Link
                href="/store"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left"
                style={{ color: "var(--text-secondary)" }}
              >
                <ShoppingBag className="w-5 h-5" />
                <span className="text-sm">Store</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
