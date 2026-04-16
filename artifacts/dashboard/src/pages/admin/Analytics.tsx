import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from "recharts";
import { format, subDays, subMonths, startOfDay, endOfDay } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/authFetch";
import { useGetAnalyticsStats, useListUsers, useListApiKeys } from "@workspace/api-client-react";
import { Users, Calendar, TrendingUp, RefreshCw } from "lucide-react";

interface TimeseriesData {
  daily: { date: string; requests: number; tokens: number; cost: number }[];
  byModel: { model: string; requests: number; cost: number }[];
  totals: { requests: number; tokens: number; cost: number };
}

const PRESETS = [
  { label: "Today", from: () => format(startOfDay(new Date()), "yyyy-MM-dd"), to: () => format(new Date(), "yyyy-MM-dd") },
  { label: "7 Days", from: () => format(subDays(new Date(), 6), "yyyy-MM-dd"), to: () => format(new Date(), "yyyy-MM-dd") },
  { label: "30 Days", from: () => format(subDays(new Date(), 29), "yyyy-MM-dd"), to: () => format(new Date(), "yyyy-MM-dd") },
  { label: "3 Months", from: () => format(subMonths(new Date(), 3), "yyyy-MM-dd"), to: () => format(new Date(), "yyyy-MM-dd") },
  { label: "All Time", from: () => "", to: () => "" },
];

export default function AdminAnalytics() {
  const [activePreset, setActivePreset] = useState("7 Days");
  const [from, setFrom] = useState(() => format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [to, setTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const { data: stats, isLoading: statsLoading } = useGetAnalyticsStats();
  const { data: usersData } = useListUsers({ limit: 100 });
  const { data: keysData } = useListApiKeys({ limit: 200 });

  const timeseriesParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [from, to]);

  const { data: tsData, isLoading: tsLoading, isError: tsError, refetch, isFetching } = useQuery<TimeseriesData>({
    queryKey: ["analytics-timeseries", from, to],
    queryFn: async () => {
      const res = await authFetch(`/api/admin/analytics/timeseries?${timeseriesParams}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  const applyPreset = (preset: typeof PRESETS[0]) => {
    const f = preset.from();
    const t = preset.to();
    setFrom(f);
    setTo(t);
    setCustomFrom(f);
    setCustomTo(t);
    setActivePreset(preset.label);
  };

  const applyCustom = () => {
    setFrom(customFrom);
    setTo(customTo);
    setActivePreset("Custom");
  };

  const chartTooltipStyle = { backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" };
  const axisTickStyle = { fill: "hsl(var(--muted-foreground))", fontSize: 12 };

  const dailyData = useMemo(() => {
    if (!tsData?.daily) return [];
    return tsData.daily.map((d) => ({
      ...d,
      date: (() => { try { return format(new Date(d.date), "MMM dd"); } catch { return d.date; } })(),
    }));
  }, [tsData]);

  const topDeveloper = useMemo(() => {
    if (!tsData || !keysData?.items || !usersData?.items) return null;
    return null;
  }, [tsData, keysData, usersData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Platform Analytics</h1>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Time Range Filter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Time Range
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                variant={activePreset === p.label ? "default" : "outline"}
                size="sm"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
            <Button size="sm" variant="outline" onClick={applyCustom}>Apply</Button>
            {activePreset === "Custom" && (
              <Badge variant="secondary" className="text-xs">Custom range</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {tsError && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          Failed to load analytics data. Please refresh the page.
        </div>
      )}

      {/* Summary stats from the selected range */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Requests Today", value: statsLoading ? null : stats?.totalRequestsToday },
          { label: "Tokens Today", value: statsLoading ? null : stats?.totalTokensToday?.toLocaleString() },
          { label: "Revenue This Month", value: statsLoading ? null : stats ? `$${stats.totalCostThisMonthUsd.toFixed(2)}` : null },
          { label: "Active Keys", value: statsLoading ? null : stats?.activeApiKeys },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              {value === null ? <Skeleton className="h-7 w-20" /> : (
                <div className="text-2xl font-bold">{value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Range totals */}
      {tsData && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: `Requests (${activePreset})`, value: tsData.totals.requests.toLocaleString(), icon: TrendingUp },
            { label: `Tokens (${activePreset})`, value: tsData.totals.tokens.toLocaleString(), icon: TrendingUp },
            { label: `Revenue (${activePreset})`, value: `$${tsData.totals.cost.toFixed(2)}`, icon: TrendingUp },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="bg-primary/5 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Token Consumption Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {tsLoading ? (
              <Skeleton className="w-full h-[280px]" />
            ) : dailyData.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground border border-dashed rounded-md">
                No data for this time range.
              </div>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTokensAdmin" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={axisTickStyle} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={axisTickStyle} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                    <RechartsTooltip contentStyle={chartTooltipStyle} itemStyle={{ color: "hsl(var(--foreground))" }} />
                    <Area type="monotone" dataKey="tokens" name="Tokens" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorTokensAdmin)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API Requests Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {tsLoading ? (
              <Skeleton className="w-full h-[240px]" />
            ) : dailyData.length === 0 ? (
              <div className="flex items-center justify-center h-[240px] text-muted-foreground border border-dashed rounded-md">
                No data for this time range.
              </div>
            ) : (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" hide />
                    <YAxis axisLine={false} tickLine={false} tick={axisTickStyle} />
                    <RechartsTooltip contentStyle={chartTooltipStyle} />
                    <Line type="monotone" dataKey="requests" name="Requests" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Models by Request</CardTitle>
          </CardHeader>
          <CardContent>
            {tsLoading ? (
              <Skeleton className="w-full h-[240px]" />
            ) : (tsData?.byModel ?? []).length === 0 ? (
              <div className="flex items-center justify-center h-[240px] text-muted-foreground border border-dashed rounded-md">
                No model data available.
              </div>
            ) : (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tsData?.byModel.slice(0, 5)} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="model" type="category" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }} width={110} />
                    <RechartsTooltip cursor={{ fill: "hsl(var(--muted))" }} contentStyle={chartTooltipStyle} />
                    <Bar dataKey="requests" name="Requests" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
