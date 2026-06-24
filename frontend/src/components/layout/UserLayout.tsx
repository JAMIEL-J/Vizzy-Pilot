import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";

export default function UserLayout() {
  return (
    <div className="helix-scope min-h-screen bg-background text-foreground font-sans antialiased">
      <TopNav />
      <main className="min-h-[calc(100vh-85px)]">
        <Outlet />
      </main>
    </div>
  );
}
