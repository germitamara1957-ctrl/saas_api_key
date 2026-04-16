import { useGetPortalMe, useGetPortalApiKeys, useListPortalPlans } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Key, CheckCircle2, Activity, CreditCard, Eye, EyeOff, Star, AlertTriangle, MailWarning, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/authFetch";

import { maskKey } from "@/lib/constants";

export default function PortalDashboard() {
  const { data: me, isLoading: meLoading, isError: meError } = useGetPortalMe();
  const { data: apiKeys, isLoading: keysLoading, isError: keysError } = useGetPortalApiKeys();
  const { data: plans } = useListPortalPlans();

  const myApiKey = apiKeys?.[0];
  const myPlan = myApiKey?.planId ? plans?.find((p) => p.id === myApiKey.planId) : null;
  const exampleModel = myPlan?.modelsAllowed?.[0] ?? "gemini-3.1-pro-preview";
  const { toast } = useToast();
  const [copiedMap, setCopiedMap] = useState<Record<number, boolean>>({});
  const [revealedMap, setRevealedMap] = useState<Record<number, boolean>>({});
  const [resendingVerification, setResendingVerification] = useState(false);

  const copyToClipboard = (key: { fullKey?: string | null; keyPrefix: string }, id: number) => {
    const text = key.fullKey ?? key.keyPrefix.replace(/\.\.\.$/, "");
    navigator.clipboard.writeText(text);
    setCopiedMap(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setCopiedMap(prev => ({ ...prev, [id]: false })), 2000);
    toast({ title: key.fullKey ? "Copied API key to clipboard" : "Copied key prefix to clipboard" });
  };

  const toggleReveal = (id: number) => {
    setRevealedMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleResendVerification = async () => {
    if (!me?.user?.email) return;
    setResendingVerification(true);
    try {
      const res = await authFetch("/api/portal/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: me.user.email }),
      });
      if (res.ok) {
        toast({ title: "Verification email sent", description: "Check your inbox and spam folder." });
      } else {
        toast({ title: "Failed to send email", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setResendingVerification(false);
    }
  };

  // Credit warning: if balance < 20% of plan monthly credits
  const planMonthlyCredits = myPlan?.monthlyCredits ?? 0;
  const currentBalance = me?.totalCreditsBalance ?? 0;
  const showLowCreditWarning =
    !meLoading && planMonthlyCredits > 0 && currentBalance < planMonthlyCredits * 0.2 && currentBalance > 0;
  const showEmailVerificationBanner =
    !meLoading && me?.user && !(me.user as { emailVerified?: boolean }).emailVerified;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-2">Welcome back, {me?.user.name}</p>
      </div>

      {/* Email verification banner */}
      {showEmailVerificationBanner && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
          <MailWarning className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Verify your email address</p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
              A verification link was sent to <strong>{me?.user.email}</strong>. Verify your email to secure your account.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
            onClick={handleResendVerification}
            disabled={resendingVerification}
          >
            {resendingVerification ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
            Resend
          </Button>
        </div>
      )}

      {/* Low credit warning banner */}
      {showLowCreditWarning && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Low credit balance</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
              Your balance is <strong>${currentBalance.toFixed(4)}</strong> — less than 20% of your plan's monthly credits.
              Contact your administrator to top up before credits run out.
            </p>
          </div>
        </div>
      )}

      {(meError || keysError) && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          Failed to load account data. Please refresh the page.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className={`${showLowCreditWarning ? "border-red-500/40 bg-red-500/5" : "bg-primary/5 border-primary/20"}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className={`text-sm font-medium ${showLowCreditWarning ? "text-red-600 dark:text-red-400" : "text-primary"}`}>
              Credit Balance
            </CardTitle>
            <CreditCard className={`h-4 w-4 ${showLowCreditWarning ? "text-red-500" : "text-primary"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${showLowCreditWarning ? "text-red-600 dark:text-red-400" : "text-primary"}`}>
              {meLoading ? "-" : `$${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}
            </div>
            <p className={`text-xs mt-1 ${showLowCreditWarning ? "text-red-500/80" : "text-primary/80"}`}>
              {showLowCreditWarning ? "⚠ Low balance — contact admin" : "Available for API calls"}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Requests This Month</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{meLoading ? "-" : me?.totalRequestsThisMonth.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Tokens This Month</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{meLoading ? "-" : me?.totalTokensThisMonth.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 md:grid-cols-12">
        <div className="md:col-span-5 space-y-6">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Your API Keys</CardTitle>
              <CardDescription>Use these keys to authenticate requests to the gateway.</CardDescription>
            </CardHeader>
            <CardContent>
              {keysLoading ? (
                <div className="text-sm text-muted-foreground">Loading keys...</div>
              ) : apiKeys?.length === 0 ? (
                <div className="text-sm text-muted-foreground">No API keys found. Contact an administrator to get one.</div>
              ) : (
                <div className="space-y-4">
                  {apiKeys?.map(key => (
                    <div key={key.id} className="p-4 border rounded-lg bg-card">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold">{key.name || "Default Key"}</span>
                          {key.isActive ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">Active</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Revoked</Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-1.5 mb-4">
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-muted rounded-md text-xs font-mono text-muted-foreground overflow-hidden break-all" data-testid={`text-key-prefix-${key.id}`}>
                            {maskKey(key.fullKey, key.keyPrefix, !!revealedMap[key.id])}
                          </code>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => toggleReveal(key.id)}
                            className="shrink-0"
                            title={revealedMap[key.id] ? "Hide API key" : "Reveal API key"}
                            data-testid={`button-reveal-key-${key.id}`}
                          >
                            {revealedMap[key.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(key, key.id)}
                            className="shrink-0"
                            title={key.fullKey ? "Copy API key" : "Copy key prefix"}
                            data-testid={`button-copy-key-${key.id}`}
                          >
                            {copiedMap[key.id] ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {key.fullKey
                            ? "Click the eye icon to reveal your API key. Store it securely — it is shown here for your reference."
                            : "Full key shown once at creation only. Create a new key if you need access again."}
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Credits: {key.creditBalance.toLocaleString()}</span>
                        <span>Last used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}</span>
                      </div>
                      {key.planId && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Star className="h-3 w-3 text-amber-500" />
                          <span>
                            Plan:{" "}
                            <span className="font-medium text-foreground">
                              {plans?.find(p => p.id === key.planId)?.name ?? `Plan #${key.planId}`}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-7">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>Integrate the AI Gateway into your application.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="curl">
                <TabsList className="grid w-full grid-cols-3 max-w-[360px] mb-4">
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                  <TabsTrigger value="python">Python</TabsTrigger>
                  <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                </TabsList>

                <TabsContent value="curl" className="m-0">
                  <div className="relative">
                    <pre className="p-4 rounded-lg bg-[#0d1117] text-[#c9d1d9] text-xs overflow-x-auto border border-border/50 leading-relaxed">
                      <code>{`# Standard (non-streaming)
curl -X POST "${window.location.origin}/api/v1/chat" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${exampleModel}",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Streaming (SSE)
curl -X POST "${window.location.origin}/api/v1/chat" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${exampleModel}",
    "stream": true,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}</code>
                    </pre>
                  </div>
                </TabsContent>
                
                <TabsContent value="python" className="m-0">
                  <div className="relative">
                    <pre className="p-4 rounded-lg bg-[#0d1117] text-[#c9d1d9] text-xs overflow-x-auto border border-border/50 leading-relaxed">
                      <code>{`import requests

# Standard
response = requests.post(
    "${window.location.origin}/api/v1/chat",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "${exampleModel}",
        "messages": [{"role": "user", "content": "Hello!"}]
    }
)
print(response.json())

# Streaming (SSE)
with requests.post(
    "${window.location.origin}/api/v1/chat",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={"model": "${exampleModel}", "stream": True,
          "messages": [{"role": "user", "content": "Hello!"}]},
    stream=True
) as r:
    for line in r.iter_lines():
        if line.startswith(b"data:"):
            print(line[5:].strip().decode())`}</code>
                    </pre>
                  </div>
                </TabsContent>
                
                <TabsContent value="javascript" className="m-0">
                  <div className="relative">
                    <pre className="p-4 rounded-lg bg-[#0d1117] text-[#c9d1d9] text-xs overflow-x-auto border border-border/50 leading-relaxed">
                      <code>{`// Standard
const res = await fetch("${window.location.origin}/api/v1/chat", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "${exampleModel}",
    messages: [{ role: "user", content: "Hello!" }]
  })
});
console.log(await res.json());

// Streaming (SSE)
const stream = await fetch("${window.location.origin}/api/v1/chat", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "${exampleModel}", stream: true,
    messages: [{ role: "user", content: "Hello!" }]
  })
});
const reader = stream.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  for (const line of text.split("\\n")) {
    if (line.startsWith("data: ") && line !== "data: [DONE]") {
      const event = JSON.parse(line.slice(6));
      if (event.delta) process.stdout.write(event.delta);
    }
  }
}`}</code>
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
              
              <div className="mt-8 space-y-4">
                <h3 className="text-sm font-medium">Available Endpoints</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 text-sm">
                    <Badge variant="outline" className="bg-primary/10 text-primary font-mono mt-0.5">POST</Badge>
                    <div>
                      <div className="font-mono font-medium">/api/v1/chat</div>
                      <div className="text-muted-foreground text-xs mt-1">Chat completions — supports streaming (<code>stream: true</code>).</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <Badge variant="outline" className="bg-primary/10 text-primary font-mono mt-0.5">POST</Badge>
                    <div>
                      <div className="font-mono font-medium">/api/v1/generate</div>
                      <div className="text-muted-foreground text-xs mt-1">Image generation using Imagen models.</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <Badge variant="outline" className="bg-primary/10 text-primary font-mono mt-0.5">POST</Badge>
                    <div>
                      <div className="font-mono font-medium">/api/v1/video</div>
                      <div className="text-muted-foreground text-xs mt-1">Video generation using Veo models.</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
