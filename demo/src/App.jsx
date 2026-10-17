import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';
import analytics from '@analytics/sdk';
import './styles.css';

const MENU = [
  { id: 'margherita', name: 'Margherita Pizza', price: 349, description: 'San Marzano tomato, creamy mozzarella, garden basil', category: 'Pizza', emoji: '🍕', tag: 'Guest favorite', vegetarian: true },
  { id: 'funghi', name: 'Wild Mushroom', price: 429, description: 'Roasted mushrooms, fontina, thyme, truffle oil', category: 'Pizza', emoji: '🍄', tag: 'Wood-fired', vegetarian: true },
  { id: 'carbonara', name: 'Carbonara', price: 389, description: 'Free-range egg, pancetta, pecorino, cracked pepper', category: 'Pasta', emoji: '🍝', tag: 'House classic', vegetarian: false },
  { id: 'ravioli', name: 'Ricotta Ravioli', price: 449, description: 'Hand-folded pasta, whipped ricotta, brown butter', category: 'Pasta', emoji: '🥟', tag: 'Made by hand', vegetarian: true },
  { id: 'tiramisu', name: 'Tiramisu', price: 229, description: 'Espresso-soaked ladyfingers, mascarpone, cocoa', category: 'Dessert', emoji: '🍰', tag: 'A sweet finish', vegetarian: true },
  { id: 'panna-cotta', name: 'Vanilla Panna Cotta', price: 199, description: 'Madagascar vanilla, seasonal berry compote', category: 'Dessert', emoji: '🍮', tag: 'Seasonal', vegetarian: true },
];
const CATEGORIES = ['All', 'Pizza', 'Pasta', 'Dessert', 'Favorites'];
const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price-low', label: 'Price: low to high' },
  { value: 'price-high', label: 'Price: high to low' },
];
const money = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(value);

function getSavedCart() {
  try {
    const saved = JSON.parse(localStorage.getItem('restaurant-cart') || '[]');
    if (!Array.isArray(saved)) return [];
    const menuItems = new Map(MENU.map((item) => [item.id, item]));
    return saved.map((id) => menuItems.get(id)).filter(Boolean);
  } catch {
    return [];
  }
}

function getSavedFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem('restaurant-favorites') || '[]');
    if (!Array.isArray(saved)) return [];
    const itemIds = new Set(MENU.map((item) => item.id));
    return [...new Set(saved.filter((id) => itemIds.has(id)))];
  } catch {
    return [];
  }
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function App() {
  const [cart, setCart] = useState(getSavedCart);
  const [favorites, setFavorites] = useState(getSavedFavorites);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [sort, setSort] = useState('recommended');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('restaurant-cart', JSON.stringify(cart.map((item) => item.id)));
    } catch (error) {
      console.warn('[demo] could not save cart', error);
    }
  }, [cart]);
  useEffect(() => {
    try {
      localStorage.setItem('restaurant-favorites', JSON.stringify(favorites));
    } catch (error) {
      console.warn('[demo] could not save favorites', error);
    }
  }, [favorites]);
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const addToCart = (item) => {
    setCart((items) => [...items, item]);
    setNotice(`${item.name} added to your bag`);
    analytics.track('add_to_cart', { item_id: item.id, price: item.price, currency: 'INR' });
  };
  const removeOne = (id) => setCart((items) => {
    const index = items.findIndex((item) => item.id === id);
    return index < 0 ? items : items.filter((_, itemIndex) => itemIndex !== index);
  });
  const clear = () => setCart([]);
  const toggleFavorite = (id) => {
    const favorited = !favorites.includes(id);
    analytics.track('menu_favorite_toggled', { item_id: id, favorited });
    setFavorites((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  };
  const subtotal = cart.reduce((sum, item) => sum + item.price, 0);

  return (
    <div className="restaurant-app min-h-screen bg-trattoria-paper text-trattoria-ink antialiased">
      <header className="store-header sticky top-0 z-30">
        <Link className="store-brand" to="/">
          <span className="store-brand-icon">M</span>
          <span><strong>Mario's</strong><small>TRATTORIA · EST. 1987</small></span>
        </Link>
        <nav className="store-nav" aria-label="Main navigation">
          <Link to="/">Our menu</Link>
          <Link to="/cart" className="cart-link" aria-label={`Your bag, ${cart.length} items`}>
            Your bag <span>{cart.length}</span>
            {cart.length > 0 && <small className="cart-subtotal">{money(subtotal)}</small>}
          </Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={
          <Home
            category={category}
            setCategory={setCategory}
            vegetarianOnly={vegetarianOnly}
            setVegetarianOnly={setVegetarianOnly}
            sort={sort}
            setSort={setSort}
            query={query}
            setQuery={setQuery}
            addToCart={addToCart}
            favorites={favorites}
            toggleFavorite={toggleFavorite}
          />
        } />
        <Route path="/item/:id" element={<ItemDetail addToCart={addToCart} />} />
        <Route path="/cart" element={<Cart cart={cart} addToCart={addToCart} removeOne={removeOne} />} />
        <Route path="/checkout" element={<Checkout cart={cart} clear={clear} />} />
        <Route path="*" element={<main className="store-main"><div className="empty-bag"><span>🧭</span><h1>We couldn't find that page.</h1><Link className="primary-button" to="/">Back to the menu</Link></div></main>} />
      </Routes>
      <footer className="store-footer"><span>Good food, good company.</span><span>Fresh from our kitchen, with love.</span></footer>
      {notice && (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full bg-stone-900 px-5 py-3 text-sm text-white shadow-xl" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>{notice}<Link className="font-semibold text-amber-200 underline underline-offset-2" to="/cart">View bag</Link>
        </div>
      )}
    </div>
  );
}

function Home({ category, setCategory, vegetarianOnly, setVegetarianOnly, sort, setSort, query, setQuery, addToCart, favorites, toggleFavorite }) {
  const filtered = useMemo(() => {
    const items = MENU.filter((item) =>
      (category === 'All' || item.category === category || (category === 'Favorites' && favorites.includes(item.id))) &&
      (!vegetarianOnly || item.vegetarian) &&
      `${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));
    if (sort === 'price-low') return items.sort((left, right) => left.price - right.price);
    if (sort === 'price-high') return items.sort((left, right) => right.price - left.price);
    return items;
  }, [category, favorites, query, sort, vegetarianOnly]);

  return (
    <main className="store-main">
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker"><i /> FAMILY-OWNED · NEIGHBORHOOD-LOVED</span>
          <h1>A little taste<br />of <em>Italy.</em></h1>
          <p>Made slowly, shared generously. Find your new favorite at Mario's table.</p>
          <a href="#menu" className="hero-cta">Explore the menu <span>↓</span></a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="hero-sun" />
          <span className="hero-food">🍝</span>
          <span className="hero-note">Fatto<br />con amore</span>
          <span className="hero-stamp">BUON<br />APPETITO</span>
        </div>
      </section>

      <section id="menu" className="menu-section">
        <div className="menu-heading">
          <div><p className="section-kicker">FROM OUR KITCHEN</p><h2>Made for the moment.</h2></div>
          <p>Everything's better when it's made fresh.<br />Take a look around.</p>
        </div>
        <div className="menu-controls">
          <div className="category-tabs" aria-label="Filter by category">
            {CATEGORIES.map((item) => (
              <button
                key={item}
                className={category === item ? 'category-tab selected' : 'category-tab'}
                onClick={() => {
                  setCategory(item);
                  analytics.track('menu_category_selected', { category: item });
                }}
                aria-pressed={category === item}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="menu-search">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find something delicious…" aria-label="Search the menu" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
          </label>
        </div>
        <div className="menu-refinements">
          <button
            className={vegetarianOnly ? 'veg-toggle active' : 'veg-toggle'}
            onClick={() => {
              analytics.track('dietary_filter_changed', { vegetarian_only: !vegetarianOnly });
              setVegetarianOnly(!vegetarianOnly);
            }}
            aria-pressed={vegetarianOnly}
          >
            <span className="veg-indicator" /> Vegetarian
          </button>
          <label className="sort-control">Sort
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                analytics.track('menu_sort_changed', { sort: event.target.value });
              }}
              aria-label="Sort menu items"
            >
              {SORTS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <span className="results-count">{filtered.length} delicious {filtered.length === 1 ? 'dish' : 'dishes'}</span>
        </div>

        {filtered.length ? (
          <div className="menu-grid">
            {filtered.map((item) => (
              <article className="menu-card" key={item.id}>
                <Link className={`dish-art dish-${item.category.toLowerCase()}`} to={`/item/${item.id}`} onClick={() => analytics.track('menu_item_view', { item_id: item.id })} aria-label={`View ${item.name}`}>
                  <span className="dish-emoji">{item.emoji}</span>
                  <span className="dish-tag">{item.tag}</span>
                  {item.vegetarian && <span className="dish-veg-badge" aria-label="Vegetarian">V</span>}
                </Link>
                <div className="dish-details">
                  <div className="dish-title-row">
                    <Link to={`/item/${item.id}`} onClick={() => analytics.track('menu_item_view', { item_id: item.id })}>{item.name}</Link>
                    <button className={favorites.includes(item.id) ? 'favorite-button favorited' : 'favorite-button'} onClick={() => toggleFavorite(item.id)} aria-label={favorites.includes(item.id) ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}>{favorites.includes(item.id) ? '♥' : '♡'}</button>
                  </div>
                  <p>{item.description}</p>
                  <div className="dish-bottom"><strong>{money(item.price)}</strong><button className="add-button" onClick={() => addToCart(item)} aria-label={`Add ${item.name} to bag`}>+</button></div>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="no-results"><span>🍋</span><p>{category === 'Favorites' && !favorites.length ? 'Save dishes with the heart and they will be waiting here.' : 'Nothing on the menu matches just yet.'}</p><button onClick={() => { setCategory('All'); setQuery(''); }}>Show me everything</button></div>}
      </section>
      <section className="store-promise"><span>🍅</span><strong>Fresh ingredients.</strong><span>🫒</span><strong>Recipes with a story.</strong><span>🍷</span><strong>Always room at our table.</strong></section>
    </main>
  );
}

function ItemDetail({ addToCart }) {
  const { id } = useParams();
  const nav = useNavigate();
  const item = MENU.find((menuItem) => menuItem.id === id);
  if (!item) return <main className="store-main"><div className="empty-bag"><span>🍋</span><h1>That dish isn't on today's menu.</h1><Link className="primary-button" to="/">Explore the menu</Link></div></main>;
  return (
    <main className="store-main detail-main">
      <Link className="back-link" to="/">← Back to menu</Link>
      <article className="detail-card">
        <div className={`detail-art dish-${item.category.toLowerCase()}`}><span>{item.emoji}</span></div>
        <div className="detail-info"><p className="section-kicker">{item.category.toUpperCase()} · {item.tag.toUpperCase()}</p><h1>{item.name}</h1><p>{item.description}. Prepared fresh in our kitchen and served with a little extra love.</p><strong>{money(item.price)}</strong><button className="primary-button" onClick={() => { addToCart(item); nav('/cart'); }}>Add to bag · {money(item.price)}</button></div>
      </article>
    </main>
  );
}

function Cart({ cart, addToCart, removeOne }) {
  const grouped = MENU.map((item) => ({ ...item, quantity: cart.filter((cartItem) => cartItem.id === item.id).length })).filter((item) => item.quantity);
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  return (
    <main className="store-main checkout-main">
      <p className="section-kicker">YOUR TABLE IS WAITING</p><h1 className="checkout-title">Your bag.</h1>
      {!cart.length ? (
        <div className="empty-bag"><span>🧺</span><h2>There's room for something delicious.</h2><p>Your bag is empty for now.</p><Link className="primary-button" to="/">Browse the menu</Link></div>
      ) : (
        <div className="cart-layout">
          <section className="cart-items">
            {grouped.map((item) => (
              <article className="cart-item" key={item.id}>
                <span className={`cart-emoji dish-${item.category.toLowerCase()}`}>{item.emoji}</span>
                <div className="cart-item-info"><strong>{item.name}</strong><span>{money(item.price)} each</span></div>
                <div className="quantity-control"><button onClick={() => removeOne(item.id)} aria-label={`Remove one ${item.name}`}>−</button><span>{item.quantity}</span><button onClick={() => addToCart(item)} aria-label={`Add one ${item.name}`}>+</button></div>
                <strong className="cart-line-total">{money(item.price * item.quantity)}</strong>
              </article>
            ))}
            <Link className="back-link continue-link" to="/">← Keep browsing</Link>
          </section>
          <aside className="order-summary"><h2>Order summary</h2><div><span>Subtotal</span><strong>{money(total)}</strong></div><div><span>Pickup</span><span className="free-label">On us</span></div><hr /><div className="summary-total"><strong>Total</strong><strong>{money(total)}</strong></div><Link className="primary-button" to="/checkout">Continue to checkout <span>→</span></Link><p>🔒 Secure, simple, and made with love.</p></aside>
        </div>
      )}
    </main>
  );
}

function Checkout({ cart, clear }) {
  const [status, setStatus] = useState(null);
  const total = cart.reduce((sum, item) => sum + item.price, 0);

  async function placeOrder(event) {
    event.preventDefault();
    if (!cart.length || status === 'placing') return;
    setStatus('placing');
    const visitor_id = readCookie('an_visitor_id');
    try {
      const response = await fetch('/api/demo/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((item) => ({ id: item.id, name: item.name, price: item.price })),
          total,
          currency: 'INR',
          visitor_id,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const order = await response.json();
      analytics.track('order_confirmation_viewed', { order_id: order.id });
      clear();
      setStatus(`success:${order.id}`);
    } catch (error) {
      setStatus(`error:${error.message}`);
    }
  }

  const successId = status?.startsWith('success:') ? status.slice(8) : null;
  if (successId) return <main className="store-main checkout-main"><div className="success-card"><span>✨</span><p className="section-kicker">ORDER CONFIRMED</p><h1>Grazie mille!</h1><p>Your order is on its way to our kitchen. We can't wait for you to try it.</p><small>Order #{successId}</small><Link className="primary-button" to="/">Back to the menu</Link></div></main>;

  return (
    <main className="store-main checkout-main">
      <p className="section-kicker">ALMOST THERE</p><h1 className="checkout-title">One last thing.</h1>
      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={placeOrder}>
          <h2>Pickup details</h2><p>We'll have everything freshly prepared for you.</p>
          {status === 'placing' && <OrderLoader />}
          <label>Your name<input required name="name" placeholder="What should we call you?" /></label>
          <label>Pickup time<select name="pickup" defaultValue="asap"><option value="asap">As soon as possible · 20–30 min</option><option value="later">I'll pick a time with the team</option></select></label>
          {!cart.length && <p className="checkout-warning">Your bag is empty. Add something tasty before checking out.</p>}
          {status?.startsWith('error:') && <p className="checkout-warning" role="alert">We couldn't place your order ({status.slice(6)}). Please try again.</p>}
          <button className="primary-button" type="submit" disabled={!cart.length || status === 'placing'}>
            {status === 'placing' ? <><span className="button-spinner" /> Sending your order…</> : `Place order · ${money(total)}`}
          </button>
        </form>
        <aside className="order-summary checkout-summary"><h2>Your order</h2>{cart.length ? cart.map((item, index) => <div key={`${item.id}-${index}`}><span>{item.name}</span><strong>{money(item.price)}</strong></div>) : <p>Your bag is empty.</p>}<hr /><div className="summary-total"><strong>Total</strong><strong>{money(total)}</strong></div><Link className="back-link" to="/cart">← Edit your bag</Link></aside>
      </div>
    </main>
  );
}

function OrderLoader() {
  return (
    <div className="order-loader" role="status" aria-live="polite">
      <div className="loader-plate" aria-hidden="true"><span>🍝</span><i /><i /><i /></div>
      <div><strong>Sending your order to the kitchen</strong><span>Freshly made, just for you…</span></div>
    </div>
  );
}
