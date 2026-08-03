import { sanitizeChineseOutput } from "@/lib/evidence";
import type { ResearchField, ResearchListItem, SalesReport } from "@/lib/types";

function cleanOptional(value: string | undefined): string | undefined {
  return typeof value === "string" ? sanitizeChineseOutput(value) : value;
}

function cleanField(field: ResearchField): ResearchField {
  return {
    ...field,
    value: cleanOptional(field.value),
    note: cleanOptional(field.note),
  };
}

function cleanItem(item: ResearchListItem): ResearchListItem {
  return {
    ...item,
    value: sanitizeChineseOutput(item.value),
    note: cleanOptional(item.note),
  };
}

/**
 * Normalize only user-facing narrative text. URLs, source identifiers, phone
 * numbers, email addresses and report metadata must remain byte-for-byte
 * unchanged.
 */
export function normalizeSalesReportNarrative(report: SalesReport): SalesReport {
  return {
    ...report,
    salesVerdict: {
      contactSuggestion: cleanField(report.salesVerdict.contactSuggestion),
      recommendationReason: cleanField(report.salesVerdict.recommendationReason),
      keyCustomerSignals: report.salesVerdict.keyCustomerSignals.map(cleanItem),
      priorityContactRole: cleanField(report.salesVerdict.priorityContactRole),
      priorityOpportunity: cleanField(report.salesVerdict.priorityOpportunity),
      recommendedNextStep: cleanField(report.salesVerdict.recommendedNextStep),
    },
    customerIntelligence: {
      companyOverview: cleanField(report.customerIntelligence.companyOverview),
      productsAndServices: report.customerIntelligence.productsAndServices.map(cleanItem),
      targetCustomersAndMarket: cleanField(report.customerIntelligence.targetCustomersAndMarket),
      businessModel: cleanField(report.customerIntelligence.businessModel),
      productPositioning: cleanField(report.customerIntelligence.productPositioning),
      scaleAndCapability: cleanField(report.customerIntelligence.scaleAndCapability),
      recentUpdates: report.customerIntelligence.recentUpdates.map(cleanItem),
      informationGaps: report.customerIntelligence.informationGaps.map(sanitizeChineseOutput),
    },
    opportunityAnalysis: {
      ...report.opportunityAnalysis,
      opportunities: report.opportunityAnalysis.opportunities.map((opportunity) => ({
        signal: cleanItem(opportunity.signal),
        painPoint: cleanItem(opportunity.painPoint),
        businessImpact: cleanField(opportunity.businessImpact),
        productMatch: cleanField(opportunity.productMatch),
        validationQuestion: cleanField(opportunity.validationQuestion),
        confidence: cleanField(opportunity.confidence),
      })),
      currentSolutionOrCompetition: cleanField(report.opportunityAnalysis.currentSolutionOrCompetition),
      overallConfidence: cleanField(report.opportunityAnalysis.overallConfidence),
    },
    conversationPlan: {
      recommendedContact: cleanField(report.conversationPlan.recommendedContact),
      communicationGoal: cleanField(report.conversationPlan.communicationGoal),
      opening30s: cleanField(report.conversationPlan.opening30s),
      valueBridge: cleanField(report.conversationPlan.valueBridge),
      discoveryQuestions: report.conversationPlan.discoveryQuestions.map((item) => ({
        question: sanitizeChineseOutput(item.question),
        purpose: sanitizeChineseOutput(item.purpose),
      })),
      objectionResponses: report.conversationPlan.objectionResponses.map(cleanItem),
      proofMaterials: report.conversationPlan.proofMaterials.map(sanitizeChineseOutput),
      nextStep: cleanField(report.conversationPlan.nextStep),
      avoidTopics: report.conversationPlan.avoidTopics.map(sanitizeChineseOutput),
    },
    collectionNotes: report.collectionNotes.map(sanitizeChineseOutput),
  };
}
