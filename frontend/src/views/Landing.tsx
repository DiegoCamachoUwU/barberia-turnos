import { useEffect, useState } from "react";
import { getCurrentShopSlug } from "../services/api";

interface ShopCard {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  _count?: { staffUsers: number; appointments: number };
}

export default function Landing({ shops, onSelect }: { shops: ShopCard[]; onSelect: (slug: string) => void }) {
  const [query, setQuery] = useState("");
  const currentShop = getCurrentShopSlug();

  const filtered = shops.filter(
    (s) => s.active && s.name.toLowerCase().includes(query.toLowerCase()) || s.slug.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <section className="panel landing">
      <div className="section-heading">
        <span className="step">🏪</span>
        <div>
          <h2>Elige una barbería</h2>
          <p>Reserva tu turno en el negocio más cercano.</p>
        </div>
      </div>
      <label>
        <span>Buscar barbería</span>
        <input type="text" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca por nombre o slug…" />
      </label>
      {filtered.length === 0 ? (
        <p className="empty">No se encontraron barberías.</p>
      ) : (
        <ul className="shop-list">
          {filtered.map((shop) => (
            <li key={shop.id} className={shop.slug === currentShop ? "active" : ""}>
              <div className="shop-info">
                <strong>{shop.name}</strong>
                <span className="shop-slug">/{shop.slug}</span>
              </div>
              <button type="button" onClick={() => onSelect(shop.slug)}>
                Ir a {shop.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}