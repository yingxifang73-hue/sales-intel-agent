import { z } from "zod";

export const PresetSchema = z.enum([
  "general",
  "ecommerce",
  "foreign_trade",
  "ai",
  "manufacturing",
]);

export type Preset = z.infer<typeof PresetSchema>;

export const SellerProfileSchema = z.object({
  productName: z.string().trim().min(2).max(80),
  valueProposition: z.string().trim().min(5).max(300),
  targetCustomer: z.string().trim().min(2).max(160),
  customerProblems: z.array(z.string().trim().min(2).max(160)).min(1).max(5),
  proofPoints: z.array(z.string().trim().min(2).max(200)).min(1).max(5),
  callToAction: z.string().trim().min(2).max(160),
});

export type SellerProfile = z.infer<typeof SellerProfileSchema>;

export const ResearchInputSchema = z.object({
  targetUrl: z.url().max(2_048),
  preset: PresetSchema,
  sellerProfile: SellerProfileSchema,
});

export type ResearchInput = z.infer<typeof ResearchInputSchema>;

export const SourceTypeSchema = z.enum(["official", "news", "social", "registry", "other"]);

export const SourceSchema = z.object({
  id: z.string().min(8),
  url: z.url(),
  canonicalUrl: z.url(),
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(40_000),
  sourceType: SourceTypeSchema,
  publishedAt: z.string().datetime().optional(),
  fetchedAt: z.string().datetime(),
  contentHash: z.string().length(64),
});

export type Source = z.infer<typeof SourceSchema>;

export const EvidenceSchema = z.object({
  id: z.string().min(8),
  claim: z.string().trim().min(5).max(600),
  kind: z.enum(["company_fact", "signal", "pain", "risk"]),
  confidence: z.number().min(0).max(1),
  sourceIds: z.array(z.string().min(8)).min(1).max(5),
});

export type Evidence = z.infer<typeof EvidenceSchema>;

export const CitedTextSchema = z.object({
  text: z.string().trim().min(2).max(600),
  sourceIds: z.array(z.string().min(8)).min(1).max(5),
});

export const PainHypothesisSchema = CitedTextSchema.extend({
  businessImpact: z.string().trim().min(4).max(300),
  confidenceLabel: z.enum(["低", "中", "高"]),
  validationQuestion: z.string().trim().min(4).max(300),
});

export const ProductMappingSchema = CitedTextSchema.extend({
  sellerCapability: z.string().trim().min(2).max(300),
  expectedValue: z.string().trim().min(2).max(300),
});

export const QuestionSchema = z.object({
  question: z.string().trim().min(4).max(300),
  purpose: z.string().trim().min(4).max(300),
});

export const TalkTrackSchema = z.object({
  objective: z.string().trim().min(4).max(300),
  opening: CitedTextSchema,
  discoveryQuestions: z.array(QuestionSchema).min(3).max(3),
  valueBridge: z.string().trim().min(4).max(400),
  recommendedNextStep: z.string().trim().min(4).max(300),
  avoid: z.array(z.string().trim().min(4).max(200)).min(1).max(3),
});

export const CompanyOverviewSchema = z.object({
  companyIntroduction: CitedTextSchema,
  productsAndServices: z.array(CitedTextSchema).min(1).max(3),
  industryAndCoverage: CitedTextSchema,
  recentUpdates: z.array(CitedTextSchema).min(1).max(3),
});

export const CompanyAnalysisSchema = z.object({
  businessModel: CitedTextSchema,
  productPositioning: CitedTextSchema,
  targetCustomers: CitedTextSchema,
  competitionObservation: CitedTextSchema,
  painHypotheses: z.array(PainHypothesisSchema).min(1).max(3),
});

export const SalesStrategySchema = z.object({
  entryPoints: z.array(CitedTextSchema).min(1).max(3),
  recommendation: CitedTextSchema,
  opening: CitedTextSchema,
  potentialNeeds: z.array(CitedTextSchema).min(1).max(3),
  discoveryQuestions: z.array(QuestionSchema).length(5),
  recommendedNextStep: z.string().trim().min(4).max(300),
  avoid: z.array(z.string().trim().min(4).max(200)).min(1).max(3),
});

export const BattlecardSchema = z.object({
  overview: CitedTextSchema.refine((value) => value.text.length <= 180, {
    message: "概览不得超过 180 个字符",
  }),
  signals: z.array(CitedTextSchema).max(3),
  painHypotheses: z.array(PainHypothesisSchema).max(3),
  talkTrack: TalkTrackSchema,
  productMappings: z.array(ProductMappingSchema).max(3),
  questions: z.array(QuestionSchema).length(5),
  opening: CitedTextSchema,
  risks: z.array(CitedTextSchema).max(5),
  companyOverview: CompanyOverviewSchema,
  companyAnalysis: CompanyAnalysisSchema,
  salesStrategy: SalesStrategySchema,
  sources: z.array(SourceSchema).min(1).max(20),
  collectionNotes: z.array(z.string().trim().min(2).max(240)).max(10),
  modelStatus: z.enum(["used", "evidence_based", "not_configured"]),
  warnings: z.array(z.string().trim().min(2).max(240)).max(10),
});

export type Battlecard = z.infer<typeof BattlecardSchema>;

export const ResearchStatusSchema = z.enum(["queued", "running", "completed", "failed"]);
export type ResearchStatus = z.infer<typeof ResearchStatusSchema>;

export const ResearchJobSchema = z.object({
  id: z.string().uuid(),
  status: ResearchStatusSchema,
  input: ResearchInputSchema,
  result: BattlecardSchema.optional(),
  error: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type ResearchJob = z.infer<typeof ResearchJobSchema>;
