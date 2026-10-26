import { useEffect, useState } from "react";
import type { User } from "./types/user";

type Status = "idle" | "loading" | "error";

interface DashboardProps {
  user: User;
  limit?: number;
  onSelect: (id: string) => void;
}

const PAGE_SIZE = 20;

export function Dashboard({ user, limit = PAGE_SIZE, onSelect }: DashboardProps) {
  const [items, setItems] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/users/${user.id}/items?limit=${limit}`)
      .then((res) => res.json())
      .then((data: string[]) => {
        if (!cancelled) setItems(data.slice(0, limit));
      })
      .catch(() => setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [user.id, limit]);

  if (status === "error") return <p className="error">Something went wrong</p>;

  return (
    <section className="dashboard" aria-busy={status === "loading"}>
      <h1>Hello, {user.name}</h1>
      <Badge count={items.length} />
      <ul>
        {items.map((item, index) => (
          <li key={item} onClick={() => onSelect(item)}>
            {index + 1}. {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Badge({ count }: { count: number }) {
  return <span className="badge">{count > 99 ? "99+" : count}</span>;
}
