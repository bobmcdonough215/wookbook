import { Concert, parseConcertDate } from "@/types/concert";
import { useMemo } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Archive, CalendarPlus, Heart, BarChart3, Search, FileUp } from "lucide-react";
import { Input } from "@/components/ui/input";

export type ViewKey = "archive" | "stats" | "upcoming" | "wishlist" | "import";

type Props = {
  view: ViewKey;
  onView: (v: ViewKey) => void;
  concerts: Concert[];
  selectedArtist: string | null;
  onSelectArtist: (a: string | null) => void;
  search: string;
  onSearch: (s: string) => void;
  upcomingCount: number;
  wishlistCount: number;
};

const navItems: { key: ViewKey; label: string; icon: typeof Archive }[] = [
  { key: "archive",  label: "Archive",     icon: Archive },
  { key: "stats",    label: "Stats",        icon: BarChart3 },
  { key: "upcoming", label: "Upcoming",     icon: CalendarPlus },
  { key: "wishlist", label: "Wishlist",     icon: Heart },
  { key: "import",   label: "Import CSV",  icon: FileUp },
];

export const AppSidebar = ({
  view, onView, concerts, selectedArtist, onSelectArtist,
  search, onSearch, upcomingCount, wishlistCount,
}: Props) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const artists = useMemo(() => {
    const m = new Map<string, { count: number; latest: number }>();
    for (const c of concerts) {
      const cur = m.get(c.artist) ?? { count: 0, latest: 0 };
      const ts = parseConcertDate(c.date).ts;
      m.set(c.artist, { count: cur.count + 1, latest: Math.max(cur.latest, ts) });
    }
    const needle = search.trim().toLowerCase();
    return [...m.entries()]
      .filter(([name]) => name !== "Various Artists" && (!needle || name.toLowerCase().includes(needle)))
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  }, [concerts, search]);

  const counts: Record<ViewKey, number | undefined> = {
    archive:  concerts.length,
    stats:    undefined,
    upcoming: upcomingCount,
    wishlist: wishlistCount,
    import:   undefined,
  };

  return (
    <Sidebar collapsible="icon" className="border-r-2 border-ink">
      <SidebarHeader className="border-b-2 border-ink p-4">
        {!collapsed ? (
          <>
            <div className="stamp">WookBook</div>
            <div className="mt-1 font-display text-2xl leading-none">Ledger</div>
          </>
        ) : (
          <div className="stamp text-center">WB</div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="stamp">Sections</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={view === item.key}
                    onClick={() => onView(item.key)}
                    tooltip={item.label}
                    className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:font-medium"
                  >
                    <item.icon className="h-4 w-4" />
                    {!collapsed && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {counts[item.key] !== undefined && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {counts[item.key]}
                          </span>
                        )}
                      </>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && view === "archive" && (
          <SidebarGroup>
            <SidebarGroupLabel className="stamp flex items-center justify-between">
              <span>Artists ({artists.length})</span>
              {selectedArtist && (
                <button
                  onClick={() => onSelectArtist(null)}
                  className="text-primary hover:underline normal-case tracking-normal"
                >
                  clear
                </button>
              )}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="px-2 pb-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder="Filter artists…"
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              </div>
              <SidebarMenu>
                {artists.map(([name, info]) => (
                  <SidebarMenuItem key={name}>
                    <SidebarMenuButton
                      isActive={selectedArtist === name}
                      onClick={() =>
                        onSelectArtist(selectedArtist === name ? null : name)
                      }
                      className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                    >
                      <span className="flex-1 truncate text-sm">{name}</span>
                      <span className="font-mono text-[10px] opacity-70">×{info.count}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {artists.length === 0 && (
                  <li className="px-3 py-2 text-xs text-muted-foreground">No matches.</li>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
};
