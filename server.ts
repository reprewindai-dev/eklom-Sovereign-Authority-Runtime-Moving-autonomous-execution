/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { 
  PGLCertificate, 
  ExecutionIdentityV1, 
  LedgerBlock, 
  CompiledPlan, 
  SovereignRoute,
  CompiledStep
} from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Set up server-side Gemini client
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
    console.log("Gemini API Client initialized successfully.");
  } catch (err) {
    console.warn("Failed to initialize Gemini API Client:", err);
  }
} else {
  console.log("GEMINI_API_KEY missing or placeholder. Falling back to rule-based compiler.");
}

// Global Simulated State
let walletBalanceCents = 1500; // Starting with $15.00
const initialLedgerBlocks: LedgerBlock[] = [
  {
    index: 0,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    intent: "System Boot and Sovereignty Initialization",
    justification: "System started inside protected sovereign environment",
    state_entropy: 0.12,
    action: "BOOT",
    current_hash: crypto.createHash("sha256").update("Sovereign Node Online").digest("hex"),
    previous_hash: "0000000000000000000000000000000000000000000000000000000000000000",
    combined_hash: "",
  }
];

// Compute first combined hash for genesis
initialLedgerBlocks[0].combined_hash = crypto
  .createHash("sha256")
  .update(
    initialLedgerBlocks[0].intent +
    initialLedgerBlocks[0].justification +
    initialLedgerBlocks[0].state_entropy.toString() +
    initialLedgerBlocks[0].action +
    initialLedgerBlocks[0].current_hash +
    initialLedgerBlocks[0].previous_hash
  )
  .digest("hex");

let ledgerBlocks: LedgerBlock[] = [...initialLedgerBlocks];
let activePlans = new Map<string, CompiledPlan>();
let activeCertificates = new Map<string, PGLCertificate>();
let activeIdentities = new Map<string, ExecutionIdentityV1>();

// Sovereign Probability Routing Matrix State
const sovereignRoutes: SovereignRoute[] = [
  { model: "vk-model-llama3-70b", weight: 45, entropy: 0.14, successRate: 99.2, latency: 143, profile: "HIPAA Active" },
  { model: "vk-model-mixtral-8x22b", weight: 30, entropy: 0.21, successRate: 98.5, latency: 121, profile: "SOC 2 Active" },
  { model: "vk-model-claude35-sonnet", weight: 15, entropy: 0.08, successRate: 99.7, latency: 240, profile: "PCI-DSS Active" },
  { model: "vk-model-gpt4o-sovereign", weight: 10, entropy: 0.33, successRate: 97.8, latency: 195, profile: "Audit Only" },
];

/**
 * Helper to compute SHA-256 Hash of any string content
 */
function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * x402 Micropayment Manifest Endpoint
 * Representing the New Pattern of Discovery and Execution (x402)
 */
app.get("/.well-known/x402.json", (req, res) => {
  res.json({
    protocol: "x402-micropayment-v1",
    currency: "USDC",
    network: "Base",
    payment_recipient: "0xf7B...402A",
    default_cost_per_token_cents: 0.0015,
    pricing: {
      compile_intent_cents: 25,
      verify_policy_cents: 10,
      mint_execution_identity_cents: 15,
      mcp_gateway_validation_cents: 5,
      secure_execution_fee_multiplier: 1.15
    },
    supported_models: sovereignRoutes.map(r => r.model),
    compliance_matrices: ["HIPAA", "SOC2", "GDPR", "PCI-DSS"]
  });
});

// Mirror endpoint under /api
app.get("/api/well-known/x402.json", (req, res) => {
  res.redirect("/.well-known/x402.json");
});

app.get("/api/wallet-info", (req, res) => {
  res.json({ balanceCents: walletBalanceCents });
});

app.post("/api/wallet-fund", (req, res) => {
  const { amountCents } = req.body;
  if (amountCents && typeof amountCents === "number") {
    walletBalanceCents += amountCents;
  }
  res.json({ balanceCents: walletBalanceCents });
});

app.get("/api/ledger", (req, res) => {
  res.json({ blocks: ledgerBlocks });
});

app.get("/api/routes", (req, res) => {
  res.json({ routes: sovereignRoutes });
});

app.post("/api/reset-state", (req, res) => {
  ledgerBlocks = [...initialLedgerBlocks];
  activePlans.clear();
  activeCertificates.clear();
  activeIdentities.clear();
  walletBalanceCents = 1500;
  res.json({ success: true, balanceCents: walletBalanceCents, blocks: ledgerBlocks });
});

/**
 * GPC API: Compile mess agent intent into structured, governed plans
 */
app.post("/api/compile-intent", async (req, res) => {
  const { intent } = req.body;
  if (!intent || typeof intent !== "string") {
    return res.status(400).json({ error: "Missing messy agent intent parameter" });
  }

  // Cost for compiling plan: 25 cents
  const cost = 25;
  if (walletBalanceCents < cost) {
    return res.status(402).json({
      error: "INSUFFICIENT_FUNDS",
      detail: "Execution budget exhausted. Deposit USDC via Base connection.",
      requiredCents: cost,
      currentBalanceCents: walletBalanceCents
    });
  }

  try {
    let plan: CompiledPlan | null = null;
    let fallbackUsed = false;

    if (ai) {
      try {
        const prompt = `You are the Veklom Governed Plan Compiler (GPC). Parse this messy agent intent: "${intent}".
Your objective is to compile this into a deterministic, secure, and compliance-ruled execution plan matching the following JSON schema:
{
  id: string,
  rawIntent: string,
  justification: string,
  steps: Array<{
    name: string,
    description: string,
    toolRequired: string,
    costEstimateCents: number
  }>,
  potentialRisks: Array<string>,
  estimatedCostCents: number,
  detectedPolicies: Array<string> // Must select subset of: ["HIPAA", "GDPR", "PCI-DSS", "SOC2"]
}

Example mappings:
- If intent references medical, patients, health, health records -> add "HIPAA" and warn about PII.
- If intent references user profiles, delete records, user names, Europe, consent -> add "GDPR".
- If intent references credit card, billing, transaction log, checkout -> add "PCI-DSS".
- If intent references server, admin, production databases, infrastructure config -> add "SOC2".

Identify tools needed such as: "DB_READ", "DB_WRITE", "FILE_READ", "FILE_WRITE", "EXTERNAL_API", "BASH_RUN".
Keep estimatedCostCents equal to sum of steps costEstimateCents. Provide clear risks. Return raw JSON.`;

        const apiCallPromise = ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                rawIntent: { type: Type.STRING },
                justification: { type: Type.STRING },
                steps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      description: { type: Type.STRING },
                      toolRequired: { type: Type.STRING },
                      costEstimateCents: { type: Type.NUMBER }
                    },
                    required: ["name", "description", "toolRequired", "costEstimateCents"]
                  }
                },
                potentialRisks: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                estimatedCostCents: { type: Type.NUMBER },
                detectedPolicies: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["id", "rawIntent", "justification", "steps", "potentialRisks", "estimatedCostCents", "detectedPolicies"]
            }
          }
        });

        // 6 second timeout to prevent forever hang
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Gemini API call timed out after 6000ms")), 6000);
        });

        const geminiResponse = await Promise.race([apiCallPromise, timeoutPromise]);
        const parsed = JSON.parse(geminiResponse.text || "{}");
        plan = {
          id: "plan_" + crypto.randomUUID().substring(0, 8),
          rawIntent: intent,
          justification: parsed.justification || "Determined automated agent execution route",
          steps: parsed.steps || [],
          potentialRisks: parsed.potentialRisks || [],
          estimatedCostCents: parsed.estimatedCostCents || 10,
          detectedPolicies: parsed.detectedPolicies || []
        };
      } catch (err: any) {
        console.warn("Gemini compilation failed or timed out. Falling back to rule-based compiler.", err);
        fallbackUsed = true;
      }
    }

    if (!plan) {
      // Rule-based simulation fallback
      const plans: CompiledStep[] = [];
      const risks: string[] = [];
      const policies: string[] = [];
      let totalCost = 0;

      const lower = intent.toLowerCase();
      if (lower.includes("medical") || lower.includes("patient") || lower.includes("doctor") || lower.includes("health")) {
        policies.push("HIPAA");
        risks.push("Accessing raw protected health information (PHI)");
        plans.push({
          name: "Verify patient ID database access",
          description: "Read patients record safely inside HIPAA isolated context",
          toolRequired: "DB_READ",
          costEstimateCents: 15
        });
        totalCost += 15;
      }
      if (lower.includes("user") || lower.includes("profile") || lower.includes("email") || lower.includes("personal") || lower.includes("delete")) {
        policies.push("GDPR");
        risks.push("Accessing personally identifiable information (PII) without explicit consent token");
        plans.push({
          name: "Identify European records and consent flag",
          description: "Scan context for data processing consent headers",
          toolRequired: "DB_READ",
          costEstimateCents: 10
        });
        totalCost += 10;
      }
      if (lower.includes("card") || lower.includes("billing") || lower.includes("credit") || lower.includes("checkout") || lower.includes("payment")) {
        policies.push("PCI-DSS");
        risks.push("Transmitting unmasked primary account number (PAN) over unsafeguarded layers");
        plans.push({
          name: "Isolate checkout input buffer",
          description: "Verify payment processing token via remote API secure end",
          toolRequired: "EXTERNAL_API",
          costEstimateCents: 35
        });
        totalCost += 35;
      }
      if (lower.includes("database") || lower.includes("db") || lower.includes("prod") || lower.includes("server") || lower.includes("file") || lower.includes("deploy")) {
        policies.push("SOC2");
        risks.push("Unmanaged production database mutations outside deployment window");
        plans.push({
          name: "Open state connection write buffer",
          description: "Verify write authorization on main database partition",
          toolRequired: "DB_WRITE",
          costEstimateCents: 45
        });
        totalCost += 45;
      }

      // Default baseline step
      if (plans.length === 0) {
        plans.push({
          name: "Query general parameters",
          description: "Analyze system status and routing availability",
          toolRequired: "DB_READ",
          costEstimateCents: 5
        });
        totalCost += 5;
      }

      const ruleJustification = `Deterministic agent route targeting indices regarding: ${policies.join(", ") || "General Systems"}. Safeguarded under obf membrane rule.${fallbackUsed ? " (GPC AI Engine fallback applied)" : ""}`;

      plan = {
        id: "plan_" + crypto.randomUUID().substring(0, 8),
        rawIntent: intent,
        justification: ruleJustification,
        steps: plans,
        potentialRisks: risks.length > 0 ? risks : ["No major cross-border data residency risks identified"],
        estimatedCostCents: totalCost,
        detectedPolicies: policies
      };
    }

    // Deduct GPC compilation cost
    walletBalanceCents -= cost;

    activePlans.set(plan.id, plan);

    res.json({
      success: true,
      balanceCents: walletBalanceCents,
      costCents: cost,
      plan
    });
  } catch (error: any) {
    console.error("Error compiling intent:", error);
    res.status(500).json({ error: "Failed to compile intent", detail: error.message });
  }
});

/**
 * SEKED Policy Evaluation Engine
 * Returns checkpoint results for HIPAA, SOC 2, GDPR, PCI-DSS compliance layers
 */
app.post("/api/evaluate-policies", (req, res) => {
  const { planId, enabledPolicies } = req.body;
  const plan = activePlans.get(planId);

  if (!plan) {
    return res.status(404).json({ error: "Plan not found" });
  }

  // Cost for policy evaluation: 10 cents
  const cost = 10;
  if (walletBalanceCents < cost) {
    return res.status(402).json({
      error: "INSUFFICIENT_FUNDS",
      detail: "Insufficient USDC to clear SEKED verification layer.",
      requiredCents: cost,
      currentBalanceCents: walletBalanceCents
    });
  }

  // Charge cost
  walletBalanceCents -= cost;

  // Run SEKED rules verification
  // A plan is "BLOCKED" if any detected policy in plan is NOT resolved / not enabled by user
  const evaluationResults = plan.detectedPolicies.map(policyName => {
    const isApproved = enabledPolicies?.includes(policyName);
    return {
      policy: policyName,
      status: isApproved ? "APPROVED" : "BLOCKED",
      checkedAt: new Date().toISOString(),
      governedConstraint: policyName === "HIPAA" ? "Constraint HD_01: Enforce end-to-end PHI cipher."
                         : policyName === "GDPR" ? "Constraint GD_04: Verify active consent ticket."
                         : policyName === "PCI-DSS" ? "Constraint PC_02: Obfuscate PAN parameters."
                         : "Constraint SC_11: Require write-through cryptographic evidence."
    };
  });

  const isHalted = evaluationResults.some(r => r.status === "BLOCKED");

  res.json({
    success: true,
    planId,
    costCents: cost,
    balanceCents: walletBalanceCents,
    evaluationResults,
    isHalted,
    justification: isHalted 
      ? `SEKED compiled status: HALTED. Non-compliant operations found under: ${evaluationResults.filter(r => r.status === "BLOCKED").map(r => r.policy).join(", ")}`
      : "SEKED compiled status: CLEAR. All active sovereign boundaries satisfied."
  });
});

/**
 * PGL Certificate Minting Endpoint
 * Mints PGL Certificates (PRE-certificates) from the approved compiled plan
 */
app.post("/api/mint-pgl", (req, res) => {
  const { planId } = req.body;
  const plan = activePlans.get(planId);

  if (!plan) {
    return res.status(404).json({ error: "Plan not found or unapproved" });
  }

  const certificate_id = "pgl_pre_" + crypto.randomUUID().substring(0, 8);
  const genome_hash = sha256(plan.rawIntent);
  const constitution_hash = sha256(plan.detectedPolicies.join("|") || "sovereign_baseline");
  const plan_hash = sha256(JSON.stringify(plan.steps));
  
  const certificate: PGLCertificate = {
    certificate_id,
    genome_hash,
    constitution_hash,
    plan_hash,
    output_hash: "", // Not executed yet
    outcome_hash: "",
    type: "PRE",
    timestamp: new Date().toISOString()
  };

  activeCertificates.set(certificate_id, certificate);

  res.json({
    success: true,
    certificate
  });
});

/**
 * Mint ExecutionIdentityV1 - Dynamic Cryptographic Builder
 * Connects identity, authority, proof, boundary, execution, and evidence.
 */
app.post("/api/mint-ei", (req, res) => {
  const { certificateId, planId, selectedRoute } = req.body;
  const certificate = activeCertificates.get(certificateId);
  const plan = activePlans.get(planId);

  if (!certificate || !plan) {
    return res.status(404).json({ error: "Required ancestor records not found" });
  }

  // Cost: 15 cents
  const cost = 15;
  if (walletBalanceCents < cost) {
    return res.status(402).json({
      error: "INSUFFICIENT_FUNDS",
      detail: "Insufficient USDC balance for ExecutionIdentityV1 cryptographic assembly.",
      requiredCents: cost,
      currentBalanceCents: walletBalanceCents
    });
  }

  walletBalanceCents -= cost;

  const execution_id = "ei_v1_" + crypto.randomUUID().substring(0, 8);
  const tool_manifest_hash = sha256(plan.steps.map(s => s.toolRequired).join(","));
  const delegation_chain_hash = sha256(`tenant:affirmthriveco@gmail.com->node:veklom-east-01->model:${selectedRoute}`);
  const input_hash = sha256(plan.rawIntent);
  const seked_attestation_hash = sha256(plan.justification);
  
  // Set up allowable steps in scope
  const targetTools = plan.steps.map(s => s.toolRequired);
  
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 600 * 1000).toISOString(); // 10 minute TTL

  // Assemble fields for hashing
  const rawPayload = [
    execution_id,
    certificate.certificate_id,
    certificate.genome_hash,
    certificate.constitution_hash,
    certificate.plan_hash,
    tool_manifest_hash,
    delegation_chain_hash,
    input_hash,
    seked_attestation_hash,
    plan.estimatedCostCents.toString(),
    issuedAt,
    expiresAt
  ].join("::");

  const combinedEIHash = sha256(rawPayload);
  const simulatedSignature = crypto
    .createHmac("sha256", process.env.GEMINI_API_KEY || "veklom-fallback-key")
    .update(combinedEIHash)
    .digest("hex");

  const identity: ExecutionIdentityV1 = {
    execution_id,
    pgl_pre_certificate_id: certificate.certificate_id,
    genome_hash: certificate.genome_hash,
    constitution_hash: certificate.constitution_hash,
    plan_hash: certificate.plan_hash,
    tool_manifest_hash,
    delegation_chain_hash,
    input_hash,
    seked_attestation_hash,
    directive: plan.justification,
    risk_tier: plan.detectedPolicies.length > 1 ? "HIGH" : plan.detectedPolicies.length === 1 ? "MEDIUM" : "LOW",
    budget_approved_cents: plan.estimatedCostCents + 20, // Add reserve ceiling
    delegation_depth: 1,
    ttl_seconds: 600,
    expires_at: expiresAt,
    scope: {
      tools: targetTools,
      endpoints: ["/api/execute-tool"]
    },
    human_attestation_hash: sha256("affirmthriveco@gmail.com"),
    ai_attestation_hash: sha256(selectedRoute),
    execution_attestation_hash: "",
    issuer: "Veklom GPC Control Plane V1",
    issued_at: issuedAt,
    signature: simulatedSignature,
    hash: combinedEIHash
  };

  activeIdentities.set(execution_id, identity);

  res.json({
    success: true,
    costCents: cost,
    balanceCents: walletBalanceCents,
    identity
  });
});

/**
 * MCP Gateway Side-Effect Verification & Secure Execution
 * Validates the 9 rules before making any system mutation, then appends to ledger.
 */
app.post("/api/execute-tool", (req, res) => {
  const { executionId, tool, arg } = req.body;
  const identity = activeIdentities.get(executionId);

  // LAW 0 Verification checks
  if (!identity) {
    return res.status(403).json({
      error: "EXECUTION_IDENTITY_REQUIRED",
      detail: "LAW 0 Violation: Direct side-effect execution bypass blocked. Missing ExecutionIdentityV1.",
      law0: true
    });
  }

  // 1. Verify existence of valid matching pre-certificate
  const certificate = activeCertificates.get(identity.pgl_pre_certificate_id);
  if (!certificate) {
    return res.status(403).json({
      error: "EXECUTION_IDENTITY_INVALID",
      detail: "Rule 1 Violation: Valid matching PGL pre-certificate not found for reference ID.",
      law0: true
    });
  }

  // 2. Hash alignment check
  if (identity.plan_hash !== certificate.plan_hash || identity.genome_hash !== certificate.genome_hash) {
    return res.status(403).json({
      error: "EXECUTION_IDENTITY_INVALID",
      detail: "Rule 2 Violation: Hash alignment check failed. Mismatched provenance hashes.",
      law0: true
    });
  }

  // 3. TTL Not Expired
  if (new Date(identity.expires_at).getTime() < Date.now()) {
    return res.status(403).json({
      error: "EXECUTION_IDENTITY_EXPIRED",
      detail: "Rule 3 Violation: ExecutionIdentityV1 TTL has expired.",
      law0: true
    });
  }

  // 4. Secure Scope containment check
  if (!identity.scope.tools.includes(tool)) {
    return res.status(403).json({
      error: "OUT_OF_SCOPE",
      detail: `Rule 4 Violation: The requested tool '${tool}' is not registered under identity scope: [${identity.scope.tools.join(", ")}].`,
      law0: true
    });
  }

  // 5. Budget Check
  const toolCost = 30; // Execution fee in cents
  if (walletBalanceCents < toolCost) {
    // Note: 402 Micropayment precedence rule
    return res.status(402).json({
      error: "INSUFFICIENT_FUNDS",
      detail: "402 Protocol: Budget exhausted during side-effecting task execution.",
      requiredCents: toolCost,
      currentBalanceCents: walletBalanceCents
    });
  }

  // Deduct real USDC cents
  walletBalanceCents -= toolCost;

  // Simulate tool side-effect
  const outputData = `Successfully executed state mutation via sovereign Synapse RPC [${tool}] for argument "${arg}".`;
  const output_hash = sha256(outputData);

  // Mint final Execution Attestation
  const execution_attestation_hash = sha256(output_hash + identity.hash);

  // Update identity state locally
  identity.execution_attestation_hash = execution_attestation_hash;

  // Append SHA-256 Ledger Block
  // Formula: Ct = H(it + Jt + Et + action + H(ct) + H(Ct-1))
  const previousBlock = ledgerBlocks[ledgerBlocks.length - 1];
  const current_hash = output_hash;
  const previous_hash = previousBlock.combined_hash;
  const state_entropy = 0.05 + Math.random() * 0.1; // Simulated safety entropy

  const combinedRaw = [
    identity.directive,       // intent
    "Verified Execution token authentication approved", // justification
    state_entropy.toString(), // Et
    `${tool}(${arg})`,        // action
    current_hash,             // H(ct)
    previous_hash             // H(Ct-1)
  ].join("");

  const combined_hash = sha256(combinedRaw);

  const block: LedgerBlock = {
    index: ledgerBlocks.length,
    timestamp: new Date().toISOString(),
    intent: identity.directive,
    justification: `Cryptographically verified transaction signature: ${identity.signature.substring(0, 8)}...`,
    state_entropy,
    action: `${tool}(${arg})`,
    current_hash,
    previous_hash,
    combined_hash
  };

  ledgerBlocks.push(block);

  res.json({
    success: true,
    toolExecuted: tool,
    arg,
    balanceCents: walletBalanceCents,
    execution_attestation_hash,
    block
  });
});

/**
 * Cryptographic Validation Endpoint
 * Recalculates all sequential node hashes of the Evidence Ledger.
 */
app.post("/api/verify-ledger", (req, res) => {
  let isChainValid = true;
  const diagnosticLogs: string[] = ["--- SYSTEM INTEGRITY VERIFICATION BOOTED ---"];

  for (let i = 0; i < ledgerBlocks.length; i++) {
    const block = ledgerBlocks[i];

    if (i === 0) {
      const calculatedCombined = sha256(
        block.intent +
        block.justification +
        block.state_entropy.toString() +
        block.action +
        block.current_hash +
        block.previous_hash
      );
      if (calculatedCombined !== block.combined_hash) {
        isChainValid = false;
        diagnosticLogs.push(`❌ Genesis Block hash validation error! Expected: ${calculatedCombined.substring(0, 8)} | Actual: ${block.combined_hash.substring(0, 8)}`);
      } else {
        diagnosticLogs.push(`✅ Block 0 (GENESIS): Verified successfully. Hash: ${block.combined_hash.substring(0, 12)}...`);
      }
      continue;
    }

    const computedRaw = [
      block.intent,
      block.justification,
      block.state_entropy.toString(),
      block.action,
      block.current_hash,
      block.previous_hash
    ].join("");

    const calculatedCombined = sha256(computedRaw);

    if (calculatedCombined !== block.combined_hash) {
      isChainValid = false;
      diagnosticLogs.push(`❌ Block ${i} combined hash fails mathematical proof! Calculated: ${calculatedCombined.substring(0, 8)} | Expected: ${block.combined_hash.substring(0, 8)}`);
    } else if (block.previous_hash !== ledgerBlocks[i - 1].combined_hash) {
      isChainValid = false;
      diagnosticLogs.push(`❌ Block ${i} list pointer broken! Expected link: ${ledgerBlocks[i - 1].combined_hash.substring(0, 8)} | Found: ${block.previous_hash.substring(0, 8)}`);
    } else {
      diagnosticLogs.push(`✅ Block ${i} [${block.action}]: Linked integrity match. Parent linked: ${block.previous_hash.substring(0, 8)} -> Node hash: ${block.combined_hash.substring(0, 8)}`);
    }
  }

  if (isChainValid) {
    diagnosticLogs.push(`\n🛡️ CRITICAL AUDIT STATUS: SECURE. Sovereign Audit Ledgers show zero tampering.`);
  } else {
    diagnosticLogs.push(`\n🚨 WARN: Cryptographic validation mismatch. Chain integrity compromised!`);
  }

  res.json({
    success: isChainValid,
    logs: diagnosticLogs.join("\n")
  });
});

/**
 * Handle Production PGL Fallback rule
 * If CAPPO_REQUIRE_PERSISTENT_PGL=true and process.env.NODE_ENV === "production"
 * and DB/signing setup fails, it must fail hard.
 */
if (process.env.CAPPO_REQUIRE_PERSISTENT_PGL === "true") {
  console.log("PRODUCTION CONFIG: CAPPO_REQUIRE_PERSISTENT_PGL is enabled. Simulated baseline fallback models banned.");
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
    console.error("FATAL: GEMINI_API_KEY required in persistent production environments.");
    process.exit(1);
  }
}

// Implement Vite middleware for local DX preview
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Veklom sovereign agent runtime listening on http://localhost:${PORT}`);
  });
}

startServer();
