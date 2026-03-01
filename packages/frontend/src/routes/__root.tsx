import { Link, Outlet } from "@tanstack/react-router";

const navLinks = [
  { to: "/" as const, label: "Chat" },
  { to: "/library" as const, label: "Library" },
] as const;

export function RootLayout() {
  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar bg-base-100 shadow-sm">
        <div className="flex-1">
          <Link to="/" className="btn btn-ghost text-xl">
            Skill Factory
          </Link>
        </div>
        <div className="flex-none">
          <ul className="menu menu-horizontal px-1">
            {navLinks.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  activeProps={{ className: "active" }}
                  activeOptions={{ exact: true }}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export function RootErrorComponent({ error }: { error: Error }) {
  return (
    <div className="hero min-h-screen bg-base-200">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <h1 className="text-5xl font-bold text-error">Something went wrong</h1>
          <p className="py-6">{error.message}</p>
          <a href="/" className="btn btn-primary">
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
