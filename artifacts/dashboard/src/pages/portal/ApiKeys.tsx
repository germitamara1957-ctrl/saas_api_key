import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetPortalApiKeys, useListPortalPlans, useCreatePortalApiKey, getGetPortalApiKeysQueryKey, type CreatePortalApiKeyResult } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, Eye, EyeOff, CheckCircle2, Star, Key, AlertCircle, Plus, ShieldCheck, Trash2, FileText, ArchiveX } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/authFetch";

import { maskKey } from "@/lib/constants";

export default function PortalApiKeys() {
  const { data: apiKeys, isLoading } = useGetPortalApiKeys();
  const queryClient = useQueryClient();
  const { data: plans } = useListPortalPlans();
  const createKey = useCreatePortalApiKey();
  const { toast } = useToast();

  const [copiedMap, setCopiedMap] = useState<Record<number, boolean>>({});
  const [revealedMap, setRevealedMap] = useState<Record<number, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<CreatePortalApiKeyResult | null>(null);
  const [newKeyCopied, setNewKeyCopied] = useState(false);
  const [deleteKeyId, setDeleteKeyId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async (keyId: number) => {
      const res = await authFetch(`/api/portal/api-keys/${keyId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete key");
      return data;
    },
    onSuccess: () => {
      toast({ title: "API key revoked successfully" });
      queryClient.invalidateQueries({ queryKey: getGetPortalApiKeysQueryKey() });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to revoke key", description: e.message, variant: "destructive" });
    },
    onSettled: () => {
      setDeletingId(null);
      setDeleteKeyId(null);
    },
  });

  const handleDelete = () => {
    if (!deleteKeyId) return;
    setDeletingId(deleteKeyId);
    deleteMutation.mutate(deleteKeyId);
  };

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedMap(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setCopiedMap(prev => ({ ...prev, [id]: false })), 2000);
    toast({ title: "API key copied to clipboard" });
  };

  const toggleReveal = (id: number) => {
    setRevealedMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreate = () => {
    createKey.mutate(
      { data: { name: keyName.trim() || undefined } },
      {
        onSuccess: (result) => {
          setNewKey(result);
          setCreateOpen(false);
          setKeyName("");
          queryClient.invalidateQueries({ queryKey: getGetPortalApiKeysQueryKey() });
        },
        onError: (e: Error) => toast({ title: "Failed to create key", description: e.message, variant: "destructive" }),
      }
    );
  };

  const copyNewKey = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey.fullKey);
    setNewKeyCopied(true);
    setTimeout(() => setNewKeyCopied(false), 2000);
    toast({ title: "API key copied — store it safely!" });
  };

  const revokedKeys = apiKeys?.filter(k => !k.isActive) ?? [];
  const activeKeys = apiKeys?.filter(k => k.isActive) ?? [];
  const visibleKeys = showRevoked ? (apiKeys ?? []) : activeKeys;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground mt-1">Keys for authenticating requests to the gateway.</p>
        </div>
        <div className="flex items-center gap-2">
          {revokedKeys.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRevoked(v => !v)}
              className={showRevoked ? "border-muted-foreground/40 text-muted-foreground" : ""}
            >
              <ArchiveX className="h-4 w-4 mr-1.5" />
              {showRevoked ? "Hide Revoked" : `Show Revoked (${revokedKeys.length})`}
            </Button>
          )}
          <Button onClick={() => { setKeyName(""); setTermsAccepted(false); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Create API Key
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading keys...</div>
      ) : !apiKeys || apiKeys.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="bg-muted rounded-full p-4">
              <Key className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">No API keys yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first key to start making API calls.</p>
            </div>
            <Button onClick={() => { setKeyName(""); setTermsAccepted(false); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Create API Key
            </Button>
          </CardContent>
        </Card>
      ) : visibleKeys.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="bg-muted rounded-full p-4">
              <Key className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">No active keys</p>
              <p className="text-sm text-muted-foreground mt-1">All your keys have been revoked. Create a new one to get started.</p>
            </div>
            <Button onClick={() => { setKeyName(""); setTermsAccepted(false); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Create API Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleKeys.map(key => {
            const plan = plans?.find(p => p.id === key.planId);
            return (
              <Card key={key.id} className={!key.isActive ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className="text-base truncate">{key.name || "Unnamed Key"}</CardTitle>
                      {key.isActive ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] shrink-0">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] shrink-0">Revoked</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {plan && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Star className="h-3 w-3 text-amber-500" />
                          <span className="font-medium">{plan.name}</span>
                        </div>
                      )}
                      {key.isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteKeyId(key.id)}
                          disabled={deletingId === key.id}
                          title="Revoke key"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <CardDescription className="text-xs">
                    Created {new Date(key.createdAt).toLocaleDateString()} · Last used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Key</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-muted rounded-md text-xs font-mono text-muted-foreground overflow-hidden break-all">
                        {maskKey(key.fullKey, key.keyPrefix, !!revealedMap[key.id])}
                      </code>
                      <Button variant="outline" size="icon" onClick={() => toggleReveal(key.id)} title={revealedMap[key.id] ? "Hide" : "Reveal"}>
                        {revealedMap[key.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(key.fullKey ?? key.keyPrefix, key.id)}
                        title="Copy"
                      >
                        {copiedMap[key.id] ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    {!key.fullKey && (
                      <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-1.5">
                        <AlertCircle className="h-3 w-3" /> Full key shown once at creation only. Create a new key if you need access again.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div className="rounded-lg bg-muted/50 border p-3 text-center">
                      <p className="text-lg font-bold">${key.creditBalance.toLocaleString()}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Credit Balance (USD)</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 border p-3 text-center">
                      <p className="text-lg font-bold">{plan?.rpm ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Rate Limit (RPM)</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 border p-3 text-center">
                      <p className={`text-lg font-bold ${key.isActive ? "text-emerald-500" : "text-muted-foreground"}`}>
                        {key.isActive ? "Active" : "Revoked"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Status</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Key Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>Give your key a name to identify it later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Key Name (optional)</Label>
              <Input
                placeholder="e.g. Production, My App, Testing..."
                value={keyName}
                onChange={e => setKeyName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && termsAccepted && handleCreate()}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              The full key is shown only once after creation. Store it securely.
            </p>

            {/* Acceptable Use Policy Agreement */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-amber-600">Acceptable Use Policy</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    By creating this key you agree that:
                  </p>
                  <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside leading-relaxed">
                    <li>You will not use this API to generate malware, illegal content, or harmful material.</li>
                    <li>You will not attempt to bypass safety filters or misuse the service.</li>
                    <li>Policy violations are <strong>logged and retained</strong> as evidence for accountability.</li>
                    <li>After <strong>3 violations</strong>, your account will be <strong>permanently suspended</strong>.</li>
                    <li><strong>No refunds</strong> will be issued for suspended accounts under any circumstances.</li>
                  </ul>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
                <Checkbox
                  id="terms"
                  checked={termsAccepted}
                  onCheckedChange={(v) => setTermsAccepted(!!v)}
                />
                <label htmlFor="terms" className="text-xs font-medium cursor-pointer select-none">
                  I have read and agree to the Acceptable Use Policy
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createKey.isPending || !termsAccepted}>
              {createKey.isPending ? "Creating..." : "Create Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteKeyId} onOpenChange={open => { if (!open) setDeleteKeyId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Revoke API Key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently deactivate the key. Any application using it will stop working immediately.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Revoking..." : "Yes, Revoke Key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Key Reveal Dialog */}
      <AlertDialog open={!!newKey} onOpenChange={open => { if (!open) setNewKey(null); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-500">
              <CheckCircle2 className="h-5 w-5" /> API Key Created
            </AlertDialogTitle>
            <AlertDialogDescription>
              Copy your full API key now — it will not be shown again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded-md text-xs font-mono break-all border border-primary/20">
                {newKey?.fullKey}
              </code>
              <Button variant="outline" size="icon" onClick={copyNewKey}>
                {newKeyCopied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-amber-600 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Store this key in a safe place. You won't be able to view the full key again.
            </p>
            {!newKey?.creditBalance && (
              <p className="text-xs text-muted-foreground">
                Your key starts with $0 credits. Contact your administrator to add credits and assign a plan.
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setNewKey(null)}>I've saved my key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
