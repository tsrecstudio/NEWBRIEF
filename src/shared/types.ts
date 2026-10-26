export type QuestionType =
  | 'like_or_not'
  | 'spectrum'
  | 'single_choice'
  | 'multi_choice'
  | 'priority_matrix'
  | 'scale_chips'
  | 'short_text'
  | 'long_text'
  | 'file_upload';

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
}

export interface SpectrumPoles {
  leftTitle: string;
  leftDescription?: string;
  rightTitle: string;
  rightDescription?: string;
}

export interface StatementItem {
  id: string;
  text: string;
  context?: string;
}

export interface PriorityBucket {
  id: string;
  label: string;
  tone?: 'primary' | 'secondary' | 'muted';
}

export interface BriefQuestion {
  id: string;
  sectionId: string;
  type: QuestionType;
  title: string;
  subtitle?: string;
  architectureImpact: string;
  allowFiles?: boolean;
  filePrompt?: string;
  // For single_choice, multi_choice, scale_chips
  options?: ChoiceOption[];
  allowCustomOption?: boolean;
  // For spectrum ("что ближе / что дальше")
  spectrum?: SpectrumPoles;
  // For like_or_not ("похоже на то или нет")
  statements?: StatementItem[];
  // For priority_matrix
  buckets?: PriorityBucket[];
  items?: ChoiceOption[];
  // For short_text / long_text
  placeholder?: string;
  quickHints?: string[];
}

export interface BriefSection {
  id: string;
  title: string;
  description: string;
  icon?: string;
}

export type StatementVote = 'yes' | 'partial' | 'no';

export interface QuestionAnswerValue {
  // single_choice or scale_chips
  selectedOptionId?: string;
  // multi_choice
  selectedOptionIds?: string[];
  customOptions?: string[];
  // spectrum (1..5, where 1 = left pole, 3 = balanced, 5 = right pole)
  spectrumValue?: number;
  // like_or_not: statementId -> 'yes' | 'partial' | 'no'
  statementVotes?: Record<string, StatementVote>;
  // priority_matrix: itemId -> bucketId
  bucketAssignments?: Record<string, string>;
  // short_text / long_text
  text?: string;
  // optional free-form comment on any question
  comment?: string;
  // explicit skip marker (purely UX convenience for client navigation)
  skipped?: boolean;
  updatedAt?: string;
}

export interface FileAttachmentMeta {
  id: string;
  briefId: string;
  questionId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface WebResearchSource {
  title: string;
  url: string;
  snippet: string;
  sourceType?: 'website' | 'search' | 'wikipedia' | 'tavily';
}

export interface ResearchDossier {
  companySummary: string;
  industryInsights: string[];
  inferredTechLandscape: string[];
  regulatoryAndSecurityFactors: string[];
  keyArchitecturalHypotheses: string[];
  searchQueriesExecuted: string[];
  sources: WebResearchSource[];
  researchedAt: string;
  aiModelUsed: string;
  usedFallbackEngine?: boolean;
}

export interface ArchitectureBlueprint {
  executiveSummary: string;
  recommendedArchitecture: string;
  suggestedTechStack: string[];
  integrationMap: string[];
  mvpScope: string[];
  phaseTwoScope: string[];
  risksAndMitigations: Array<{ risk: string; mitigation: string }>;
  openQuestionsForCall: string[];
  estimatedComplexity: string;
  generatedAt: string;
  modelUsed: string;
}

export type BriefStatus = 'active' | 'in_progress' | 'submitted' | 'locked';

export interface BriefClientIntake {
  companyName: string;
  companyWebsite?: string;
  industry?: string;
  contactName?: string;
  contactRole?: string;
  knownSystems?: string;
  projectContext: string;
  constraintsAndDeadlines?: string;
  intakeDocumentText?: string;
  depth?: 'compact' | 'standard' | 'deep';
  enableWebSearch?: boolean;
}

export interface BriefRecord {
  id: string;
  accessToken: string;
  hasPin: boolean;
  pinHint?: string;
  pinCodePlainForAdmin?: string;
  status: BriefStatus;
  title: string;
  clientWelcomeNote: string;
  estimatedMinutes: number;
  intake: BriefClientIntake;
  sections: BriefSection[];
  questions: BriefQuestion[];
  answers: Record<string, QuestionAnswerValue>;
  attachments: FileAttachmentMeta[];
  researchDossier?: ResearchDossier;
  architectureBlueprint?: ArchitectureBlueprint;
  respondentName?: string;
  respondentRole?: string;
  respondentContact?: string;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
  lastClientActivityAt?: string;
  submittedAt?: string;
}

export interface BriefSummaryItem {
  id: string;
  accessToken: string;
  hasPin: boolean;
  pinCodePlainForAdmin?: string;
  status: BriefStatus;
  title: string;
  companyName: string;
  industry?: string;
  totalQuestions: number;
  answeredQuestions: number;
  attachmentsCount: number;
  isDemo?: boolean;
  aiModelUsed?: string;
  createdAt: string;
  updatedAt: string;
  lastClientActivityAt?: string;
  submittedAt?: string;
}

export interface PublicBriefPayload {
  id: string;
  title: string;
  companyName: string;
  clientWelcomeNote: string;
  estimatedMinutes: number;
  status: BriefStatus;
  sections: BriefSection[];
  questions: BriefQuestion[];
  answers: Record<string, QuestionAnswerValue>;
  attachments: FileAttachmentMeta[];
  respondentName?: string;
  respondentRole?: string;
  respondentContact?: string;
  updatedAt: string;
  submittedAt?: string;
  brand: BrandSettings;
}

export interface BrandSettings {
  companyName: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  navyColor: string;
  darkColor: string;
  surfaceColor: string;
  extractedPalette?: string[];
  sourcePdfName?: string;
}
