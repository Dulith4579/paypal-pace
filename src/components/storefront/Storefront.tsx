// src/components/storefront/Storefront.tsx
"use client";

// ============================================================
// Apex Electronics storefront — shared building blocks
// ============================================================
// Generated from the /store page (catalog data, header, catalog grid,
// product detail layout, footer) so other storefront variants render the
// identical store. Used by /store-standard (the "without PayPal Pace"
// baseline). /store keeps its own copy and is unchanged.
// ============================================================

import { useMemo } from "react";
import Image from "next/image";
import {
  ShoppingCart,
  Search,
  Cpu,
  Monitor,
  Battery,
  HardDrive,
  Zap,
  Star,
  Truck,
  RotateCcw,
  ShieldCheck,
  Check,
  Headphones,
  Laptop,
  Mouse,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { formatCurrency } from "@/lib/math-engine";

export const MERCHANT = "Apex Electronics";

// ────────────────────────────────────────────────────────────
// PRODUCT DATA (demo catalog — ratings/reviews are illustrative)
// ────────────────────────────────────────────────────────────

/** The one product with a live checkout. Its name/price are what PayPalPaceModal receives. */
export const product = {
  id: "apex-air-13",
  name: 'Apex Air 13" Laptop - Sand (8-core CPU, 16GB Memory, 512GB SSD)',
  image: "/products/apex-air-13.svg",
  price: 1099,
  wasPrice: 1199,
  rating: 4.9,
  reviews: 1420,
  specs: [
    { icon: Cpu, label: "Apex A1 chip · 8-core CPU / 10-core GPU" },
    { icon: HardDrive, label: "16GB unified memory · 512GB NVMe SSD" },
    { icon: Monitor, label: '13.6" high-resolution IPS display' },
    { icon: Battery, label: "Up to 18 hours battery life" },
    { icon: Zap, label: "Magnetic charging · 2× USB-C / USB4" },
    { icon: Laptop, label: "Backlit keyboard with fingerprint unlock" },
  ],
};

export type Category = "Laptops & Workstations" | "Displays" | "Keyboards & Mice" | "Studio Audio";
export const CATEGORIES: Category[] = ["Laptops & Workstations", "Displays", "Keyboards & Mice", "Studio Audio"];

export interface CatalogItem {
  id: string;
  title: string;
  price: number;
  wasPrice?: number;
  icon: typeof Laptop;
  /** Product photo in /public/products. */
  image: string;
  category: Category;
  rating: number;
  reviews?: number;
  badge: string;
  shipping: string;
  /** Only the flagship opens the product page / checkout. */
  buyable?: boolean;
}

export const catalog: CatalogItem[] = [
  {
    id: product.id,
    title: product.name,
    price: product.price,
    wasPrice: product.wasPrice,
    icon: Laptop,
    image: product.image,
    category: "Laptops & Workstations",
    rating: product.rating,
    reviews: product.reviews,
    badge: "Best Seller",
    shipping: "In Stock · Free Priority Shipping",
    buyable: true,
  },
  {
    id: "apex-view-27",
    title: 'ApexView 27" 5K Display with USB-C Hub',
    price: 1299,
    icon: Monitor,
    image: "/products/apex-view-27.svg",
    category: "Displays",
    rating: 4.8,
    badge: "In Stock",
    shipping: "Free shipping",
  },
  {
    id: "glide-mouse",
    title: "Glide Wireless Mouse - White Multi-Touch Surface",
    price: 99,
    icon: Mouse,
    image: "/products/glide-mouse.svg",
    category: "Keyboards & Mice",
    rating: 4.6,
    badge: "Multi-Touch",
    shipping: "Free shipping",
  },
  {
    id: "quietwave-anc",
    title: "QuietWave ANC Wireless Noise-Canceling Headphones",
    price: 349,
    icon: Headphones,
    image: "/products/quietwave-anc.svg",
    category: "Studio Audio",
    rating: 4.7,
    badge: "Active Noise Canceling",
    shipping: "Free shipping",
  },
];


// HEADER
// ────────────────────────────────────────────────────────────

export function StoreHeader({
  cartCount,
  query,
  onQuery,
  category,
  onCategory,
  onHome,
  onCart,
}: {
  /** Optional: what the header cart button does (e.g. open a cart drawer). */
  onCart?: () => void;
  cartCount: number;
  query: string;
  onQuery: (q: string) => void;
  category: Category | null;
  onCategory: (c: Category) => void;
  onHome: () => void;
}) {
  return (
    <header className="sticky top-0 z-40" style={{ background: "var(--store-chrome)", boxShadow: "0 1px 0 rgba(255,255,255,0.06)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3 sm:gap-6">
        <button id="store-home" onClick={onHome} className="flex items-center gap-2 shrink-0">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#F97316" }}>
            <Zap className="w-4 h-4 text-white" />
          </span>
          <span className="text-white font-extrabold tracking-[0.12em] text-sm sm:text-base">APEX ELECTRONICS</span>
        </button>

        <label className="order-3 sm:order-none w-full sm:w-auto sm:flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-white/90 focus-within:bg-white/15">
          <Search className="w-4 h-4 text-white/60 shrink-0" />
          <input
            id="store-search"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search laptops, displays, accessories…"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-white/50"
          />
        </label>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle variant="onDark" />
          <select
            aria-label="Currency"
            className="text-xs font-semibold rounded-md px-2 py-1.5 bg-white/10 text-white border border-white/15"
            defaultValue="USD"
          >
            <option value="USD">
              USD $
            </option>
          </select>
          <button
            id="cart-icon"
            onClick={onCart}
            className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/20"
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline">Cart</span>
            <span data-testid="cart-count">({cartCount})</span>
          </button>
        </div>
      </div>

      <nav className="border-t border-white/10">
        <ul className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-5 overflow-x-auto text-[13px] font-medium">
          {CATEGORIES.map((c) => (
            <li key={c}>
              <button
                onClick={() => onCategory(c)}
                className="py-2.5 whitespace-nowrap transition-colors"
                style={{
                  color: category === c ? "white" : "rgba(255,255,255,0.7)",
                  borderBottom: category === c ? "2px solid #F97316" : "2px solid transparent",
                }}
              >
                {c}
              </button>
            </li>
          ))}
          <li className="ml-auto hidden md:block py-2.5 text-white/60 whitespace-nowrap">Free shipping on orders over $49</li>
        </ul>
      </nav>
    </header>
  );
}

// ────────────────────────────────────────────────────────────
// CATALOG
// ────────────────────────────────────────────────────────────

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size, color: "#F59E0B", fill: i < Math.round(rating) ? "#F59E0B" : "none" }}
        />
      ))}
    </span>
  );
}

export function CatalogView({
  query,
  category,
  cart,
  onAdd,
  onConfigure,
  onClearFilters,
}: {
  query: string;
  category: Category | null;
  cart: string[];
  onAdd: (id: string) => void;
  onConfigure: () => void;
  onClearFilters: () => void;
}) {
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(
      (i) => (!category || i.category === category) && (!q || `${i.title} ${i.category}`.toLowerCase().includes(q))
    );
  }, [query, category]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-12" id="hardware-hub">
      {/* Hero promotion */}
      {!category && !query && (
        <section
          className="relative rounded-2xl px-6 py-8 sm:px-10 sm:py-12 mb-8 overflow-hidden"
          style={{ background: "linear-gradient(120deg, #0F172A 0%, #1E293B 55%, #334155 100%)" }}
        >
          <div
            className="absolute -right-20 -top-20 w-80 h-80 rounded-full opacity-25"
            style={{ background: "radial-gradient(circle, #F97316 0%, transparent 70%)" }}
          />
          {/* Product spotlight (photo has a white studio background) */}
          <button
            onClick={onConfigure}
            className="hidden md:block absolute right-14 top-1/2 -translate-y-1/2 w-[34%] max-w-[360px] rounded-2xl p-3 shadow-2xl transition-transform hover:scale-[1.02]"
            aria-label="View Apex Air 13-inch laptop"
            style={{ background: "var(--store-photo)" }}
          >
            <span className="relative block w-full aspect-[1591/1003]">
              <Image src={product.image} alt="Apex Air 13-inch laptop in Sand" fill sizes="360px" className="object-contain mix-blend-multiply" priority />
            </span>
            <span className="mt-2 flex items-center justify-between text-xs">
              <span className="font-semibold" style={{ color: "#0f172a" }}>
                Apex Air 13&quot; Laptop
              </span>
              <span className="font-bold" style={{ color: "var(--store-accent)" }}>
                {formatCurrency(product.price)}
              </span>
            </span>
          </button>
          <div className="relative max-w-xl md:max-w-[55%]">
            <p className="text-xs font-bold uppercase tracking-[0.2em] mb-3" style={{ color: "#FDBA74" }}>
              New season · Pro hardware
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight mb-3">Next-Gen Engineering Workstations</h1>
            <p className="text-sm sm:text-base text-white/75 mb-6">
              Built for compile speed, edge AI inference, and all-day mobile deployment.
            </p>
            <button
              onClick={onConfigure}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm text-white"
              style={{ background: "#F97316" }}
            >
              Shop Apex Air 13 <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold" style={{ color: "var(--store-text)" }}>
          {category ?? (query ? `Results for “${query}”` : "Featured")}
        </h2>
        <span className="text-xs" style={{ color: "var(--store-muted)" }}>
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border" style={{ borderColor: "var(--store-border)", background: "var(--store-surface)" }}>
          <p className="text-sm mb-3" style={{ color: "var(--store-text-3)" }}>
            No products match your search.
          </p>
          <button onClick={onClearFilters} className="text-sm font-semibold underline" style={{ color: "var(--store-accent)" }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((item) => {
            const Icon = item.icon;
            const inCart = cart.includes(item.id);
            return (
              <article
                key={item.id}
                id={`catalog-${item.id}`}
                className="flex flex-col rounded-2xl overflow-hidden border transition-all hover:shadow-lg hover:-translate-y-0.5"
                style={{ borderColor: "var(--store-border)", background: "var(--store-surface)" }}
              >
                <button
                  onClick={item.buyable ? onConfigure : undefined}
                  className="relative aspect-[4/3] flex items-center justify-center"
                  style={{ cursor: item.buyable ? "pointer" : "default", background: "var(--store-photo)", borderBottom: "1px solid var(--store-border)" }}
                  tabIndex={item.buyable ? 0 : -1}
                  aria-label={item.buyable ? `View ${item.title}` : undefined}
                >
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className="object-contain p-5 mix-blend-multiply transition-transform duration-300 hover:scale-[1.03]"
                      priority={item.buyable}
                    />
                  ) : (
                    <Icon className="w-20 h-20" style={{ color: "var(--store-faint)", strokeWidth: 0.9 }} />
                  )}
                  {item.buyable && (
                    <span className="absolute top-3 left-3 px-2 py-0.5 rounded text-[11px] font-bold text-white" style={{ background: "var(--store-accent)" }}>
                      {item.badge}
                    </span>
                  )}
                </button>
                <div className="flex flex-col flex-1 p-4">
                  <div className="flex items-center gap-1.5 text-xs mb-1.5" style={{ color: "var(--store-text-3)" }}>
                    <Stars rating={item.rating} size={12} />
                    <span className="font-semibold">{item.rating}</span>
                    {item.reviews ? <span>({item.reviews.toLocaleString()} reviews)</span> : <span>· {item.badge}</span>}
                  </div>
                  <h3 className="text-sm font-semibold leading-snug mb-3" style={{ color: "var(--store-text)" }}>
                    {item.title}
                  </h3>
                  <div className="mt-auto">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold" style={{ color: "var(--store-text)" }}>
                        {formatCurrency(item.price)}
                      </span>
                      {item.wasPrice && (
                        <span className="text-xs line-through" style={{ color: "var(--store-faint)" }}>
                          {formatCurrency(item.wasPrice)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-medium mt-1 mb-3" style={{ color: item.buyable ? "var(--store-ok)" : "var(--store-muted)" }}>
                      {item.shipping}
                    </p>
                    {item.buyable ? (
                      <button
                        id="configure-checkout-btn"
                        onClick={onConfigure}
                        className="w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:brightness-110"
                        style={{ background: "var(--store-cta)", color: "var(--store-cta-text)" }}
                      >
                        Configure &amp; Buy <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => onAdd(item.id)}
                        disabled={inCart}
                        data-testid={`add-${item.id}`}
                        className="w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 border transition-all"
                        style={{
                          background: inCart ? "var(--store-ok-bg)" : "var(--store-surface)",
                          color: inCart ? "var(--store-ok)" : "var(--store-text)",
                          borderColor: inCart ? "var(--store-ok-border)" : "var(--store-border-strong)",
                        }}
                      >
                        {inCart ? (
                          <>
                            <Check className="w-4 h-4" /> Added to cart
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-4 h-4" /> Add to cart
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <TrustRow />
    </main>
  );
}

export function TrustRow() {
  return (
    <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[
        { icon: Truck, label: "Free priority shipping", sub: "On all laptops & workstations" },
        { icon: RotateCcw, label: "30-day returns", sub: "Free return label included" },
        { icon: ShieldCheck, label: "2-year warranty", sub: "On laptops & displays" },
      ].map((b) => {
        const Icon = b.icon;
        return (
          <div key={b.label} className="flex items-center gap-3 p-4 rounded-xl border" style={{ borderColor: "var(--store-border)", background: "var(--store-surface)" }}>
            <Icon className="w-5 h-5 shrink-0" style={{ color: "var(--store-accent)" }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--store-text)" }}>
                {b.label}
              </div>
              <div className="text-[11px]" style={{ color: "var(--store-muted)" }}>
                {b.sub}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ────────────────────────────────────────────────────────────
// PRODUCT DETAIL (layout shared; each storefront supplies its buy box)
// ────────────────────────────────────────────────────────────

export function ProductDetail({
  onBack,
  cart,
  onAdd,
  buyBox,
}: {
  onBack: () => void;
  cart: string[];
  onAdd: (id: string) => void;
  buyBox: React.ReactNode;
}) {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <button
          id="back-to-catalog"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-semibold px-2 py-1 rounded-md hover:bg-black/5"
          style={{ color: "var(--store-text)" }}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Workstations
        </button>
        <nav className="flex items-center gap-1.5 text-xs" style={{ color: "var(--store-muted)" }} aria-label="Breadcrumb">
          <button onClick={onBack} className="hover:underline">
            Home
          </button>
          <ChevronRight className="w-3 h-3" />
          <button onClick={onBack} className="hover:underline">
            Laptops &amp; Workstations
          </button>
          <ChevronRight className="w-3 h-3" />
          <span style={{ color: "var(--store-text)" }}>Apex Air 13&quot; Laptop · Sand</span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Gallery + details */}
        <div className="lg:col-span-3">
          <div className="w-full aspect-[4/3] rounded-2xl relative border overflow-hidden" style={{ borderColor: "var(--store-border)", background: "var(--store-photo)" }} id="product-photo">
            <Image
              src={product.image}
              alt="Apex Air 13-inch laptop in Sand, front view"
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="object-contain p-6 mix-blend-multiply"
              priority
            />
            <span className="absolute top-4 left-4 px-2 py-0.5 rounded text-[11px] font-bold text-white" style={{ background: "var(--store-accent)" }}>
              Best Seller
            </span>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--store-muted)" }}>
            Color: <b style={{ color: "var(--store-text)" }}>Sand</b>
          </p>

          <h1 className="text-2xl font-bold mt-6 mb-2 leading-snug" style={{ color: "var(--store-text)" }}>
            {product.name}
          </h1>
          <div className="flex items-center gap-2 text-sm mb-6" style={{ color: "var(--store-text-3)" }}>
            <Stars rating={product.rating} />
            <span className="font-semibold">{product.rating}</span>
            <span>({product.reviews.toLocaleString()} reviews)</span>
          </div>

          <section className="p-5 rounded-xl border mb-6" style={{ borderColor: "var(--store-border)", background: "var(--store-surface)" }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--store-text)" }}>
              Technical specifications
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {product.specs.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--store-subtle)" }}>
                      <Icon className="w-4 h-4" style={{ color: "var(--store-text-2)" }} />
                    </span>
                    <span className="text-sm" style={{ color: "var(--store-text-2)" }}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs" style={{ color: "var(--store-text-3)" }}>
            <span className="flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4" style={{ color: "var(--store-accent)" }} /> 30-day returns
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" style={{ color: "var(--store-accent)" }} /> 2-year warranty
            </span>
          </div>
        </div>

        {/* Buy box */}
        <aside className="lg:col-span-2">{buyBox}</aside>
      </div>

      <section className="mt-12" id="bought-together">
        <h2 className="text-lg font-bold mb-4" style={{ color: "var(--store-text)" }}>
          Frequently bought together
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {catalog
            .filter((i) => !i.buyable)
            .map((i) => {
              const inCart = cart.includes(i.id);
              return (
                <div key={i.id} className="flex gap-3 p-3 rounded-xl border items-center" style={{ borderColor: "var(--store-border)", background: "var(--store-surface)" }}>
                  <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden" style={{ background: "var(--store-photo)" }}>
                    <Image src={i.image} alt={i.title} fill sizes="80px" className="object-contain p-1 mix-blend-multiply" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-snug line-clamp-2" style={{ color: "var(--store-text)" }}>
                      {i.title}
                    </p>
                    <p className="text-sm font-bold mt-1" style={{ color: "var(--store-text)" }}>
                      {formatCurrency(i.price)}
                    </p>
                    <button
                      onClick={() => onAdd(i.id)}
                      disabled={inCart}
                      className="mt-1 text-xs font-semibold"
                      style={{ color: inCart ? "var(--store-ok)" : "var(--store-accent)" }}
                    >
                      {inCart ? "✓ Added to cart" : "+ Add to cart"}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </section>
    </main>
  );
}

// FOOTER
// ────────────────────────────────────────────────────────────

export function StoreFooter() {
  return (
    <footer style={{ background: "var(--store-chrome)", color: "rgba(255,255,255,0.65)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs">
        <div className="col-span-2 sm:col-span-1">
          <div className="text-white font-extrabold tracking-[0.12em] mb-2">APEX ELECTRONICS</div>
          <p>Pro hardware for people who build things.</p>
        </div>
        {[
          ["Shop", "Laptops & Workstations", "Displays", "Keyboards & Mice", "Studio Audio"],
          ["Support", "Shipping", "Returns", "Warranty"],
          ["Company", "About", "Careers", "Privacy"],
        ].map(([head, ...links]) => (
          <div key={head}>
            <div className="text-white font-semibold mb-2">{head}</div>
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 py-3 text-center text-[11px]">© 2026 Apex Electronics · Demo store</div>
    </footer>
  );
}

