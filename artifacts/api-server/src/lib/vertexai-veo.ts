import { type VideoJobResult, type VideoJobStatus } from "./vertexai-types";
import { resolveVertexModelId } from "./vertexai-types";
import { getActiveProvider, getAccessToken } from "./vertexai-provider";

export async function generateVideoWithVeo(
  model: string,
  prompt: string,
  durationSeconds = 5,
  sampleCount = 1,
): Promise<VideoJobResult> {
  const provider = await getActiveProvider();
  const token = await getAccessToken(provider);

  const { projectId, location } = provider;
  const vertexModel = resolveVertexModelId(model);

  // Correct endpoint: :predictLongRunning (not :generateVideo)
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${vertexModel}:predictLongRunning`;

  // Correct request body format per Vertex AI Veo documentation
  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount,
      durationSeconds,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Veo API error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as { name?: string };
  return { operationName: data.name ?? "" };
}

export async function getVideoJobStatus(operationName: string): Promise<VideoJobStatus> {
  const provider = await getActiveProvider();
  const token = await getAccessToken(provider);

  const { projectId, location } = provider;

  // Extract the model name from the operation name
  // Format: projects/{projectId}/locations/{location}/publishers/google/models/{model}/operations/{opId}
  const modelMatch = operationName.match(/\/models\/([^/]+)\//);
  const vertexModel = modelMatch?.[1];

  if (!vertexModel) {
    throw new Error(`Cannot extract model name from operation: ${operationName}`);
  }

  // Correct polling endpoint: :fetchPredictOperation (POST, not GET)
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${vertexModel}:fetchPredictOperation`;

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ operationName }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to get job status: ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    done?: boolean;
    response?: {
      videos?: Array<{ uri?: string; encoding?: string }>;
      generatedSamples?: Array<{ video?: { uri?: string } }>;
    };
    error?: { message?: string };
  };

  if (data.error) {
    return { done: true, error: data.error.message };
  }

  if (data.done) {
    const videoUri =
      data.response?.videos?.[0]?.uri ??
      data.response?.generatedSamples?.[0]?.video?.uri;
    return { done: true, videoUri };
  }

  return { done: false };
}
