import { useGetPortalApiKeys } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, ShieldAlert, FileWarning, Ban, AlertTriangle } from "lucide-react";
import { useState, Fragment } from "react";
import { useToast } from "@/hooks/use-toast";

const GATEWAY_URL = window.location.origin;

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="relative group">
      <pre className="p-4 rounded-lg bg-[#0d1117] text-[#c9d1d9] text-xs overflow-x-auto border border-border/50 leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-[#21262d] hover:bg-[#30363d] text-[#8b949e]"
        onClick={copy}
      >
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold tracking-tight">{children}</h2>;
}

interface ModelRow {
  id: string;
  alias?: string;
  type: string;
  pricing: string;
}

interface ModelSection {
  label: string;
  models: ModelRow[];
}

function ModelIdCell({ id, alias }: { id: string; alias?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copy = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Model ID copied", description: id });
  };

  return (
    <div className="flex items-start gap-1.5">
      <div className="min-w-0">
        <span className="font-mono text-xs">{id}</span>
        {alias && (
          <span className="ml-2 text-[10px] text-muted-foreground font-mono bg-muted px-1 py-0 rounded">
            alias: {alias}
          </span>
        )}
      </div>
      <button
        onClick={copy}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
        title="Copy model ID"
      >
        {copied
          ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

const MODEL_SECTIONS: ModelSection[] = [
  {
    label: "Google — Gemini 2.5",
    models: [
      { id: "gemini-2.5-pro",        type: "Text", pricing: "$1.25 / $10.00 per 1M tokens (in/out)" },
      { id: "gemini-2.5-flash",      type: "Text", pricing: "$0.30 / $2.50 per 1M tokens (in/out)"  },
      { id: "gemini-2.5-flash-lite", type: "Text", pricing: "$0.10 / $0.40 per 1M tokens (in/out)"  },
    ],
  },
  {
    label: "Google — Gemini 3.1",
    models: [
      { id: "gemini-3.1-pro-preview",         type: "Text", pricing: "$2.00 / $12.00 per 1M tokens (in/out)" },
      { id: "gemini-3.1-flash-lite-preview",  type: "Text", pricing: "$0.25 / $1.50 per 1M tokens (in/out)"  },
      { id: "gemini-3.1-flash-image-preview", type: "Text", pricing: "$0.50 / $3.00 per 1M tokens (in/out)"  },
    ],
  },
  {
    label: "Google — Gemini 3",
    models: [
      { id: "gemini-3.0-pro-preview",       type: "Text", pricing: "$2.00 / $12.00 per 1M tokens (in/out)" },
      { id: "gemini-3.0-flash-preview",     type: "Text", pricing: "$0.50 / $3.00 per 1M tokens (in/out)"  },
      { id: "gemini-3.0-pro-image-preview", type: "Text", pricing: "$2.00 / $12.00 per 1M tokens (in/out)"  },
    ],
  },
  {
    label: "Google — Imagen",
    models: [
      { id: "imagen-4.0-generate-001",       alias: "imagen-4",       type: "Image", pricing: "$0.04 per image" },
      { id: "imagen-4.0-ultra-generate-001", alias: "imagen-4-ultra", type: "Image", pricing: "$0.06 per image" },
      { id: "imagen-3.0-generate-002",       alias: "imagen-3",       type: "Image", pricing: "$0.04 per image" },
      { id: "imagen-3.0-fast-generate-001",  alias: "imagen-3-fast",  type: "Image", pricing: "$0.02 per image" },
    ],
  },
  {
    label: "Google — Veo",
    models: [
      { id: "veo-3.1-generate-001",      alias: "veo-3.1",      type: "Video", pricing: "$0.40 per second" },
      { id: "veo-3.1-fast-generate-001", alias: "veo-3.1-fast", type: "Video", pricing: "$0.12 per second" },
      { id: "veo-3.0-generate-001",      alias: "veo-3",        type: "Video", pricing: "$0.40 per second" },
      { id: "veo-2.0-generate-001",      alias: "veo-2",        type: "Video", pricing: "$0.50 per second" },
    ],
  },
  {
    label: "xAI — Grok",
    models: [
      { id: "grok-4.20",         type: "Text", pricing: "$0.20 / $0.50 per 1M tokens (in/out)" },
      { id: "grok-4.1-thinking", type: "Text", pricing: "$0.20 / $0.50 per 1M tokens (in/out)" },
    ],
  },
  {
    label: "DeepSeek",
    models: [
      { id: "deepseek-v3.2", type: "Text", pricing: "$0.56 / $1.68 per 1M tokens (in/out)" },
    ],
  },
  {
    label: "Google — Gemma MaaS",
    models: [
      { id: "gemma-4-26b", type: "Text", pricing: "$0.20 / $0.80 per 1M tokens (in/out)" },
    ],
  },
  {
    label: "Kimi (Moonshot AI)",
    models: [
      { id: "kimi-k2", type: "Text", pricing: "$0.60 / $2.50 per 1M tokens (in/out)" },
    ],
  },
  {
    label: "MiniMax",
    models: [
      { id: "minimax-m2", type: "Text", pricing: "$0.30 / $1.20 per 1M tokens (in/out)" },
    ],
  },
];

const MODELS: ModelRow[] = MODEL_SECTIONS.flatMap((s) => s.models);

export default function PortalDocs() {
  const { data: apiKeys } = useGetPortalApiKeys();
  const apiKey = apiKeys?.[0]?.fullKey ?? "YOUR_API_KEY";
  const base = GATEWAY_URL;

  // ── Chat ────────────────────────────────────────────────────────────────────
  const chatCurl = `curl -X POST "${base}/api/v1/chat" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-3.1-pro-preview",
    "messages": [
      {"role": "user", "content": "Hello! How are you?"}
    ],
    "temperature": 0.7,
    "maxOutputTokens": 1024
  }'`;

  const chatPython = `import requests

response = requests.post(
    "${base}/api/v1/chat",
    headers={"Authorization": "Bearer ${apiKey}"},
    json={
        "model": "gemini-3.1-pro-preview",
        "messages": [
            {"role": "user", "content": "Hello! How are you?"}
        ],
        "temperature": 0.7,
        "maxOutputTokens": 1024
    }
)

data = response.json()
print(data["content"])         # the assistant reply
print(data["inputTokens"])     # tokens used
print(data["costUsd"])         # cost charged`;

  const chatJs = `const response = await fetch("${base}/api/v1/chat", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "gemini-3.1-pro-preview",
    messages: [{ role: "user", content: "Hello! How are you?" }],
    temperature: 0.7,
    maxOutputTokens: 1024
  })
});

const data = await response.json();
console.log(data.content);      // the assistant reply
console.log(data.inputTokens);  // tokens used
console.log(data.costUsd);      // cost charged`;

  const chatResponse = `{
  "id": "req_abc123",
  "model": "gemini-3.1-pro-preview",
  "content": "Hello! I'm doing well, thank you for asking.",
  "inputTokens": 10,
  "outputTokens": 12,
  "totalTokens": 22,
  "costUsd": 0.0000148
}`;

  // ── Generate (Image) ────────────────────────────────────────────────────────
  const genCurl = `curl -X POST "${base}/api/v1/generate" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "imagen-4",
    "prompt": "A sunset over the ocean, photorealistic",
    "sampleCount": 1
  }'`;

  const genPython = `import requests, base64

response = requests.post(
    "${base}/api/v1/generate",
    headers={"Authorization": "Bearer ${apiKey}"},
    json={
        "model": "imagen-4",
        "prompt": "A sunset over the ocean, photorealistic",
        "sampleCount": 1
    }
)

data = response.json()

# Display or save the first image
img_b64 = data["images"][0]["base64"]
img_bytes = base64.b64decode(img_b64)

with open("output.png", "wb") as f:
    f.write(img_bytes)

print("Cost USD:", data["costUsd"])`;

  const genJs = `const response = await fetch("${base}/api/v1/generate", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "imagen-4",
    prompt: "A sunset over the ocean, photorealistic",
    sampleCount: 1
  })
});

const data = await response.json();

// Display the image in the browser
const img = document.createElement("img");
img.src = \`data:\${data.images[0].mimeType};base64,\${data.images[0].base64}\`;
document.body.appendChild(img);

console.log("Cost:", data.costUsd);`;

  const genResponse = `{
  "id": "req_xyz789",
  "model": "imagen-4",
  "images": [
    {
      "base64": "<base64-encoded PNG data>",
      "mimeType": "image/png"
    }
  ],
  "costUsd": 0.052
}`;

  // ── Video ───────────────────────────────────────────────────────────────────
  const videoCurl = `# Step 1 — Start video generation
curl -X POST "${base}/api/v1/video" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "veo-3.1",
    "prompt": "A time-lapse of clouds moving over mountains",
    "durationSeconds": 5
  }'

# Step 2 — Poll for status (use jobId from Step 1)
curl "${base}/api/v1/video/{jobId}" \\
  -H "Authorization: Bearer ${apiKey}"`;

  const videoPython = `import requests, time

# Step 1: Start generation
response = requests.post(
    "${base}/api/v1/video",
    headers={"Authorization": "Bearer ${apiKey}"},
    json={
        "model": "veo-3.1",
        "prompt": "A time-lapse of clouds over mountains",
        "durationSeconds": 5
    }
)
job_id = response.json()["jobId"]
print("Job started:", job_id)

# Step 2: Poll until done
while True:
    status = requests.get(
        f"${base}/api/v1/video/{job_id}",
        headers={"Authorization": "Bearer ${apiKey}"}
    ).json()

    if status["status"] == "completed":
        print("Video URL:", status["videoUrl"])
        break
    elif status["status"] == "error":
        print("Error:", status["errorMessage"])
        break

    print("Still processing...")
    time.sleep(5)`;

  const videoJs = `// Step 1: Start generation
const start = await fetch("${base}/api/v1/video", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "veo-3.1",
    prompt: "A time-lapse of clouds over mountains",
    durationSeconds: 5
  })
});
const { jobId } = await start.json();

// Step 2: Poll for status
async function pollVideo(jobId) {
  const res = await fetch(\`${base}/api/v1/video/\${jobId}\`, {
    headers: { "Authorization": "Bearer ${apiKey}" }
  });
  const status = await res.json();

  if (status.status === "completed") return status.videoUrl;
  if (status.status === "error") throw new Error(status.errorMessage);

  await new Promise(r => setTimeout(r, 5000));
  return pollVideo(jobId);
}

const videoUrl = await pollVideo(jobId);
console.log("Video ready:", videoUrl);`;

  const videoStartResponse = `{
  "jobId": "req_vid123",
  "status": "pending",
  "videoUrl": null,
  "errorMessage": null,
  "model": "veo-3.1",
  "costUsd": 2.0
}`;

  const videoPollResponse = `{
  "jobId": "req_vid123",
  "status": "completed",
  "videoUrl": "https://storage.googleapis.com/...",
  "errorMessage": null,
  "model": "veo-3.1",
  "costUsd": 2.0
}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Documentation</h1>
        <p className="text-muted-foreground mt-1">Complete reference for all gateway endpoints with code examples.</p>
      </div>

      {/* Base URL */}
      <Card>
        <CardHeader><CardTitle className="text-base">Base URL</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock code={base} />
          <div className="text-sm text-muted-foreground space-y-1">
            <p>All requests require: <code className="text-xs bg-muted px-1 py-0.5 rounded">Authorization: Bearer YOUR_API_KEY</code></p>
            <p>All responses are JSON. Errors return: <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{ \"error\": \"...\" }"}</code></p>
          </div>
        </CardContent>
      </Card>

      {/* Models Reference */}
      <div className="space-y-3">
        <SectionTitle>Available Models</SectionTitle>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Model ID</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pricing (with markup)</th>
                </tr>
              </thead>
              <tbody>
                {MODEL_SECTIONS.map((section) => (
                  <Fragment key={section.label}>
                    <tr className="bg-muted/40 border-t border-border/50">
                      <td colSpan={3} className="px-4 py-1.5 text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                        {section.label}
                      </td>
                    </tr>
                    {section.models.map((m) => (
                      <tr key={m.id} className="border-t border-border/20 hover:bg-muted/10">
                        <td className="px-4 py-2.5">
                          <ModelIdCell id={m.id} alias={m.alias} />
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={
                            m.type === "Text"  ? "text-blue-500 border-blue-500/30 bg-blue-500/5" :
                            m.type === "Image" ? "text-purple-500 border-purple-500/30 bg-purple-500/5" :
                                                 "text-amber-500 border-amber-500/30 bg-amber-500/5"
                          }>{m.type}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{m.pricing}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Model availability depends on your plan. Check the <strong>Plans</strong> page for details.
        </p>
      </div>

      {/* Chat Endpoint */}
      <div className="space-y-3">
        <SectionTitle>Text Generation</SectionTitle>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-primary/10 text-primary font-mono">POST</Badge>
              <code className="text-base font-mono font-semibold">/api/v1/chat</code>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Chat completions using Gemini, Grok, Mistral, DeepSeek, and 40+ partner models. Supports multi-turn conversations and streaming.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Request Parameters</p>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-border/30">
                    {[
                      ["model", "string", "Required", "Model ID (e.g. gemini-3.1-pro-preview)"],
                      ["messages", "array", "Required", "Array of {role, content} objects"],
                      ["temperature", "number", "Optional", "0–2, default 1.0"],
                      ["maxOutputTokens", "number", "Optional", "Max tokens to generate"],
                      ["stream", "boolean", "Optional", "Stream response as SSE"],
                    ].map(([name, type, req, desc]) => (
                      <tr key={name}>
                        <td className="py-1.5 pr-2 font-mono text-primary">{name}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">{type}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">{req}</td>
                        <td className="py-1.5 text-muted-foreground">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Response</p>
                <CodeBlock code={chatResponse} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Examples</p>
              <Tabs defaultValue="curl">
                <TabsList className="mb-3">
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                  <TabsTrigger value="python">Python</TabsTrigger>
                  <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                </TabsList>
                <TabsContent value="curl" className="m-0"><CodeBlock code={chatCurl} /></TabsContent>
                <TabsContent value="python" className="m-0"><CodeBlock code={chatPython} /></TabsContent>
                <TabsContent value="javascript" className="m-0"><CodeBlock code={chatJs} /></TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generate Endpoint */}
      <div className="space-y-3">
        <SectionTitle>Image Generation</SectionTitle>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-primary/10 text-primary font-mono">POST</Badge>
              <code className="text-base font-mono font-semibold">/api/v1/generate</code>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Generate images using Imagen models. Returns base64-encoded PNG images.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Request Parameters</p>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-border/30">
                    {[
                      ["model", "string", "Required", "Imagen model ID"],
                      ["prompt", "string", "Required", "Image description"],
                      ["sampleCount", "number", "Optional", "Number of images, default 1"],
                      ["n", "number", "Optional", "Alias for sampleCount"],
                    ].map(([name, type, req, desc]) => (
                      <tr key={name}>
                        <td className="py-1.5 pr-2 font-mono text-primary">{name}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">{type}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">{req}</td>
                        <td className="py-1.5 text-muted-foreground">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-muted-foreground mt-3">
                  To display the image:<br />
                  <code className="bg-muted px-1 py-0.5 rounded">data:image/png;base64,{"{images[0].base64}"}</code>
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Response</p>
                <CodeBlock code={genResponse} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Examples</p>
              <Tabs defaultValue="curl">
                <TabsList className="mb-3">
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                  <TabsTrigger value="python">Python</TabsTrigger>
                  <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                </TabsList>
                <TabsContent value="curl" className="m-0"><CodeBlock code={genCurl} /></TabsContent>
                <TabsContent value="python" className="m-0"><CodeBlock code={genPython} /></TabsContent>
                <TabsContent value="javascript" className="m-0"><CodeBlock code={genJs} /></TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Video Endpoint */}
      <div className="space-y-3">
        <SectionTitle>Video Generation</SectionTitle>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-primary/10 text-primary font-mono">POST</Badge>
              <code className="text-base font-mono font-semibold">/api/v1/video</code>
              <Badge variant="secondary" className="text-xs">Async</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Generate videos using Veo models. Video generation is asynchronous — start a job then poll for completion.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Step 1 — POST /api/v1/video</p>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-border/30">
                      {[
                        ["model", "string", "Required", "Veo model ID"],
                        ["prompt", "string", "Required", "Video description"],
                        ["durationSeconds", "number", "Optional", "Duration 5–8s, default 5"],
                      ].map(([name, type, req, desc]) => (
                        <tr key={name}>
                          <td className="py-1.5 pr-2 font-mono text-primary">{name}</td>
                          <td className="py-1.5 pr-2 text-muted-foreground">{type}</td>
                          <td className="py-1.5 pr-2 text-muted-foreground">{req}</td>
                          <td className="py-1.5 text-muted-foreground">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Step 2 — GET /api/v1/video/{"{jobId}"}</p>
                  <p className="text-xs text-muted-foreground">Poll every 5–10 seconds until <code className="bg-muted px-1 py-0.5 rounded">status</code> is <code className="bg-muted px-1 py-0.5 rounded">completed</code> or <code className="bg-muted px-1 py-0.5 rounded">error</code>.</p>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Start Response (202)</p>
                  <CodeBlock code={videoStartResponse} />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Poll Response</p>
                  <CodeBlock code={videoPollResponse} />
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Examples</p>
              <Tabs defaultValue="curl">
                <TabsList className="mb-3">
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                  <TabsTrigger value="python">Python</TabsTrigger>
                  <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                </TabsList>
                <TabsContent value="curl" className="m-0"><CodeBlock code={videoCurl} /></TabsContent>
                <TabsContent value="python" className="m-0"><CodeBlock code={videoPython} /></TabsContent>
                <TabsContent value="javascript" className="m-0"><CodeBlock code={videoJs} /></TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error Codes */}
      <div className="space-y-3">
        <SectionTitle>Error Codes</SectionTitle>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground w-20">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Meaning</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {[
                  ["400", "Policy Violation", "Request blocked by content safety filters — review the Acceptable Use Policy"],
                  ["401", "Unauthorized", "Invalid or missing API key"],
                  ["402", "Payment Required", "Insufficient credit balance — top up your account"],
                  ["403", "Forbidden", "Model not allowed on your plan, or account suspended due to policy violations"],
                  ["429", "Too Many Requests", "Rate limit exceeded — slow down or upgrade your plan"],
                  ["502", "Bad Gateway", "Vertex AI returned an error — check prompt or try again"],
                ].map(([code, meaning, fix]) => (
                  <tr key={code}>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-destructive">{code}</td>
                    <td className="px-4 py-2.5 text-sm">{meaning}</td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Acceptable Use Policy */}
      <div className="space-y-3">
        <SectionTitle>Acceptable Use Policy</SectionTitle>
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-base text-amber-600">Important — Read Before Using</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              By using this API you agree to these terms. Violations are automatically detected, <strong>permanently logged</strong>, and used as legal evidence.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Prohibited */}
            <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Ban className="h-4 w-4 text-destructive" />
                <p className="text-sm font-semibold text-destructive">Strictly Prohibited</p>
              </div>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {[
                  "Creating or distributing malware, ransomware, viruses, or any harmful software",
                  "Hacking, unauthorized access, SQL injection, DDoS attacks, or cyberattacks of any kind",
                  "Generating sexual content involving minors (CSAM) — zero tolerance, reported to authorities",
                  "Instructions for creating weapons, explosives, or dangerous chemical substances",
                  "Promoting terrorism, violent extremism, or incitement to violence",
                  "Fraud, scams, identity theft, forgery, or financial crimes",
                  "Attempting to bypass or jailbreak safety filters",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-destructive mt-0.5 shrink-0">✗</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Warning system */}
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-semibold text-amber-600">Enforcement — 3-Strike System</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-2xl font-bold text-amber-500">1</p>
                  <p className="font-medium mt-1">First Violation</p>
                  <p className="text-muted-foreground mt-0.5">Warning issued. Request logged and stored.</p>
                </div>
                <div className="rounded-md bg-orange-500/10 border border-orange-500/20 p-3">
                  <p className="text-2xl font-bold text-orange-500">2</p>
                  <p className="font-medium mt-1">Second Violation</p>
                  <p className="text-muted-foreground mt-0.5">Final warning. One strike remaining.</p>
                </div>
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-2xl font-bold text-destructive">3</p>
                  <p className="font-medium mt-1">Account Suspended</p>
                  <p className="text-muted-foreground mt-0.5">Permanent ban. No refund issued.</p>
                </div>
              </div>
            </div>

            {/* Evidence logging */}
            <div className="rounded-lg bg-muted/50 border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Evidence Retention</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Every blocked request is <strong>permanently stored</strong> in our system with the full message content, timestamp,
                IP address, and account details. This evidence is retained to prevent false claims and ensure accountability.
                By using this service you explicitly consent to this logging.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
