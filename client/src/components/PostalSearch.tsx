import { useState } from "react";
import type { FormEvent } from "react";

type PostalSearchProps = {
  onSearch: (postal: string) => Promise<void>;
  busy: boolean;
  error: string | null;
  status: string | null;
};

export function PostalSearch({
  onSearch,
  busy,
  error,
  status,
}: PostalSearchProps) {
  const [postal, setPostal] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSearch(postal.trim());
  }

  return (
    <section className="search" aria-labelledby="search-heading">
      <p className="brand">Housing Toronto</p>
      <h1 id="search-heading">Find an available shelter near you</h1>
      <p className="lede">
        Enter a Toronto postal code to locate the nearest shelter with open
        capacity.
      </p>

      <form className="search-form" onSubmit={handleSubmit}>
        <label htmlFor="postal">Postal code</label>
        <div className="search-row">
          <input
            id="postal"
            name="postal"
            type="text"
            autoComplete="postal-code"
            placeholder="M5V 1E3"
            value={postal}
            onChange={(e) => setPostal(e.target.value)}
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? "Searching…" : "Find nearest shelter"}
          </button>
        </div>
      </form>

      {error ? <p className="message message-error">{error}</p> : null}
      {status && !error ? <p className="message">{status}</p> : null}
    </section>
  );
}
