import type { CheckoutResponse, MenuProduct, MenuResponse } from "@siparis/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { LanguageToggle } from "../../components/LanguageToggle";
import { StatusScreen } from "../../components/StatusScreen";
import { ApiRequestError } from "../../lib/api";
import { brandStyle } from "../../lib/color";
import { matchesSearch } from "../../lib/search";
import { priceCart, type CartLine } from "../cart/cart";
import { CartBar } from "../cart/CartBar";
import { useCart } from "../cart/cart-context";
import { CartProvider } from "../cart/CartProvider";
import { CartSheet } from "../cart/CartSheet";
import { CheckoutSheet } from "../checkout/CheckoutSheet";
import { OrderSuccess } from "../checkout/OrderSuccess";
import styles from "./MenuPage.module.css";
import { ProductCard } from "./ProductCard";
import { ProductSheet } from "./ProductSheet";
import { useMenu } from "./useMenu";

export function MenuPage() {
  const { qrToken = "" } = useParams();
  const { t } = useTranslation();
  const menu = useMenu(qrToken);

  if (menu.isPending) return <StatusScreen title={t("common.loading")} />;

  if (menu.isError) {
    const error = menu.error;
    if (error instanceof ApiRequestError && error.code === "CAFE_INACTIVE") {
      const cafe = typeof error.details?.cafeName === "string" ? error.details.cafeName : "";
      return (
        <StatusScreen
          icon="☕"
          title={t("menu.inactiveTitle")}
          text={t("menu.inactiveText", { cafe })}
        />
      );
    }
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 400)) {
      return (
        <StatusScreen icon="🔍" title={t("menu.notFoundTitle")} text={t("menu.notFoundText")} />
      );
    }
    return (
      <StatusScreen
        icon="📶"
        title={t("menu.errorTitle")}
        text={t("menu.errorText")}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void menu.refetch()}>
            {t("common.retry")}
          </button>
        }
      />
    );
  }

  return (
    <CartProvider qrToken={qrToken}>
      <Menu qrToken={qrToken} menu={menu.data} />
    </CartProvider>
  );
}

type OpenSheet =
  | { kind: "product"; product: MenuProduct; editing?: CartLine }
  | { kind: "cart"; notice?: string }
  | { kind: "checkout" }
  | null;

function Menu({ qrToken, menu }: { qrToken: string; menu: MenuResponse }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { cart, dispatch } = useCart();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [placedOrder, setPlacedOrder] = useState<CheckoutResponse | null>(null);

  const categories = useMemo(
    () =>
      menu.categories
        .map((category) => ({
          ...category,
          products: category.products.filter((p) =>
            matchesSearch(deferredQuery, p.name, p.description),
          ),
        }))
        .filter((category) => category.products.length > 0),
    [menu, deferredQuery],
  );
  const activeCategory = useActiveCategory(categories.map((c) => c.id));
  const priced = useMemo(() => priceCart(cart, menu), [cart, menu]);

  const products = useMemo(
    () => new Map(menu.categories.flatMap((c) => c.products.map((p) => [p.id, p] as const))),
    [menu],
  );
  const editLine = (line: CartLine) => {
    const product = products.get(line.productId);
    if (product) setSheet({ kind: "product", product, editing: line });
  };

  const orderPlaced = (order: CheckoutResponse) => {
    dispatch({ type: "clear" });
    setSheet(null);
    setPlacedOrder(order);
    window.scrollTo({ top: 0 });
  };
  const cartChanged = () => {
    // Reload the menu so the cart re-prices and flags the lines that changed.
    void queryClient.invalidateQueries({ queryKey: ["menu", qrToken] });
    setSheet({ kind: "cart", notice: t("cart.changed") });
  };

  if (placedOrder) {
    return (
      <div style={brandStyle(menu.cafe.primaryColor)}>
        <OrderSuccess
          order={placedOrder}
          tableName={menu.table.name}
          onBack={() => setPlacedOrder(null)}
        />
      </div>
    );
  }

  return (
    <div className={styles.page} style={brandStyle(menu.cafe.primaryColor)}>
      <title>{`${menu.cafe.name} · ${t("common.appName")}`}</title>

      <header className={styles.hero}>
        {menu.cafe.coverUrl && <img className={styles.cover} src={menu.cafe.coverUrl} alt="" />}
        <div className={styles.heroContent}>
          {menu.cafe.logoUrl && <img className={styles.logo} src={menu.cafe.logoUrl} alt="" />}
          <div className={styles.heroText}>
            <h1 className={styles.cafeName}>{menu.cafe.name}</h1>
            <p className={styles.tableName}>{menu.table.name}</p>
          </div>
          <LanguageToggle className={styles.langToggle} />
        </div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span className="visually-hidden">{t("menu.searchLabel")}</span>
          <span className={styles.searchIcon} aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("menu.searchPlaceholder")}
            autoComplete="off"
            enterKeyHint="search"
          />
          {query && (
            <button
              type="button"
              className={styles.clearSearch}
              onClick={() => setQuery("")}
              aria-label={t("menu.clearSearch")}
            >
              ×
            </button>
          )}
        </label>
        {categories.length > 1 && (
          <nav className={styles.categoryNav} aria-label={t("menu.categories")}>
            {categories.map((category) => (
              <a
                key={category.id}
                href={`#category-${category.id}`}
                className={styles.categoryLink}
                aria-current={activeCategory === category.id ? "true" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  document
                    .getElementById(`category-${category.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {category.name}
              </a>
            ))}
          </nav>
        )}
      </div>

      <main className={styles.content}>
        {categories.length === 0 && (
          <p className={styles.noResults}>{t("menu.noResults", { query: deferredQuery.trim() })}</p>
        )}
        {categories.map((category) => (
          <section
            key={category.id}
            id={`category-${category.id}`}
            className={styles.section}
            aria-labelledby={`heading-${category.id}`}
          >
            <h2 id={`heading-${category.id}`} className={styles.sectionTitle}>
              {category.name}
            </h2>
            <ul className={styles.products}>
              {category.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onOpen={() => setSheet({ kind: "product", product })}
                />
              ))}
            </ul>
          </section>
        ))}
      </main>

      <CartBar priced={priced} onOpen={() => setSheet({ kind: "cart" })} />

      {sheet?.kind === "product" && (
        <ProductSheet
          key={sheet.editing?.key ?? sheet.product.id}
          product={sheet.product}
          editing={sheet.editing}
          onClose={() => setSheet(sheet.editing ? { kind: "cart" } : null)}
        />
      )}
      {sheet?.kind === "cart" && (
        <CartSheet
          priced={priced}
          notice={sheet.notice}
          onEdit={editLine}
          onCheckout={() => setSheet({ kind: "checkout" })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "checkout" && (
        <CheckoutSheet
          qrToken={qrToken}
          priced={priced}
          onBack={() => setSheet({ kind: "cart" })}
          onSuccess={orderPlaced}
          onCartChanged={cartChanged}
        />
      )}
    </div>
  );
}

/** Highlights the category section currently at the top of the screen. */
function useActiveCategory(ids: string[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(ids[0]);
  const key = ids.join(",");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const order = key.split(",");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace("category-", "");
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = order.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    for (const id of order) {
      const element = document.getElementById(`category-${id}`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);

  return active;
}
