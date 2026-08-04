import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import {
  classificationDocSchema,
  scaleEvidenceSchema,
  type ClassificationDoc,
  type ScaleEvidence,
} from "@alpacto/shared-schemas";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../../fixtures");

let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return client;
}

function loadFixture<T>(name: string): T {
  const raw = fs.readFileSync(path.join(FIXTURES, name), "utf8");
  return JSON.parse(raw) as T;
}

async function visionExtract<T>(
  schemaName: string,
  imageBase64: string,
  mimeType: string,
  prompt: string,
  parser: (data: unknown) => T,
): Promise<T> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: config.openai.visionModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });
  const text = response.choices[0]?.message?.content ?? "{}";
  return parser(JSON.parse(text));
}

export async function extractScaleEvidence(
  imageBase64: string,
  mimeType: string,
): Promise<ScaleEvidence> {
  if (config.ayni.useFixtureVision) {
    return scaleEvidenceSchema.parse(loadFixture("scale-reading.json"));
  }
  return visionExtract(
    "scale",
    imageBase64,
    mimeType,
    'Extract scale weight from the image. Return JSON: {"readingDetected":bool,"weightValueKg":number|null,"weightUnit":"kg","displayReadable":bool,"confidence":0-1,"warnings":[]}',
    (d) => scaleEvidenceSchema.parse(d),
  );
}

export async function extractClassificationDocument(
  imageBase64: string,
  mimeType: string,
): Promise<ClassificationDoc> {
  if (config.ayni.useFixtureVision) {
    return classificationDocSchema.parse(loadFixture("classification-doc.json"));
  }
  return visionExtract(
    "classification",
    imageBase64,
    mimeType,
    'Extract classification document fields. Return JSON: {"documentReadable":bool,"lotReference":string|null,"classification":string|null,"inspectorName":string|null,"inspectionDate":string|null,"confidence":0-1,"missingFields":[]}',
    (d) => classificationDocSchema.parse(d),
  );
}
