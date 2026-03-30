import * as fs from 'node:fs';
import * as path from 'node:path';

import type { RuntimeState, RuntimeTask } from './runtimeState';

export type LangString = {
  value: string;
  lang?: string;
};

export type GraphElement = {
  identifier: string;
  type: string;
  name: LangString[];
  documentation?: LangString[];
  properties?: {
    property: Array<{
      propertyDefinitionRef: string;
      value: LangString[];
    }>;
  };
  extensions?: Record<string, unknown>;
};

export type GraphRelationship = GraphElement & {
  source: string;
  target: string;
  accessType?: string;
  modifier?: string;
  isDirected?: boolean;
};

export type GraphOrganization = {
  identifier?: string;
  label?: LangString[];
  documentation?: LangString[];
  item?: GraphOrganization[];
  elementRef?: string;
  relationshipRef?: string;
  conceptRef?: string;
  propertyDefinitionRef?: string;
  stereotypeRef?: string;
  extensions?: Record<string, unknown>;
};

export type SharedKnowledgeGraph = {
  identifier: string;
  version?: string;
  name: LangString[];
  documentation?: LangString[];
  metadata?: Record<string, unknown>;
  elements?: {
    element: GraphElement[];
  };
  relationships?: {
    relationship: GraphRelationship[];
  };
  organizations?: GraphOrganization[];
  propertyDefinitions?: {
    propertyDefinition: Array<Record<string, unknown>>;
  };
  extensions?: Record<string, unknown>;
};

export type ArchitectureLayer = 'strategy' | 'business' | 'application' | 'technology' | 'other';

export type ArchitectureCoverageSummary = {
  totalElements: number;
  totalRelationships: number;
  byLayer: Record<ArchitectureLayer, number>;
  missingCoreLayers: Array<'strategy' | 'business' | 'application' | 'technology'>;
};

export type IntentionModelStatus = {
  architecturalElementCount: number;
  architecturalRelationshipCount: number;
  crossLayerRelationshipCount: number;
  baselineEstablished: boolean;
  isIntentModelSufficient: boolean;
};

const CANONICAL_GRAPH_FILE = path.join('.opencode', 'temp', 'SharedKnowledgeGraph.archimate3.1.json');
const LEGACY_GRAPH_FILE = path.join('design', 'KG', 'SystemArchitecture.json');

type CounterMap = Record<string, number>;

function toLangString(value: string): LangString[] {
  return [{ value }];
}

function toDocumentation(value?: string): LangString[] | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }
  return [{ value: value.trim() }];
}

function toOptionalLabel(value?: string): LangString[] | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }
  return [{ value: value.trim() }];
}

function ensureExtensions(graph: SharedKnowledgeGraph): Record<string, unknown> {
  graph.extensions ??= {};
  return graph.extensions;
}

function ensureCounters(graph: SharedKnowledgeGraph): CounterMap {
  const extensions = ensureExtensions(graph);
  const ai4pb = (extensions.ai4pb ??= {}) as Record<string, unknown>;
  ai4pb.counters ??= {};
  return ai4pb.counters as CounterMap;
}

function ensureElementArray(graph: SharedKnowledgeGraph): GraphElement[] {
  graph.elements ??= { element: [] };
  return graph.elements.element;
}

function ensureRelationshipArray(graph: SharedKnowledgeGraph): GraphRelationship[] {
  graph.relationships ??= { relationship: [] };
  return graph.relationships.relationship;
}

function ensureOrganizationArray(graph: SharedKnowledgeGraph): GraphOrganization[] {
  graph.organizations ??= [];
  return graph.organizations;
}

function cleanupEmptySections(graph: SharedKnowledgeGraph): void {
  if (graph.elements && graph.elements.element.length === 0) {
    delete graph.elements;
  }
  if (graph.relationships && graph.relationships.relationship.length === 0) {
    delete graph.relationships;
  }
  if (graph.organizations && graph.organizations.length === 0) {
    delete graph.organizations;
  }
  if (graph.propertyDefinitions && graph.propertyDefinitions.propertyDefinition.length === 0) {
    delete graph.propertyDefinitions;
  }
}

export function getCanonicalKnowledgeGraphPath(worktree: string): string {
  return path.join(worktree, CANONICAL_GRAPH_FILE);
}

export function getLegacyKnowledgeGraphPath(worktree: string): string {
  return path.join(worktree, LEGACY_GRAPH_FILE);
}

export function createDefaultSharedKnowledgeGraph(): SharedKnowledgeGraph {
  return {
    identifier: 'ai4pb-shared-knowledge-graph',
    version: '1.0.0',
    name: toLangString('AI4PB Shared Knowledge Graph'),
    documentation: toDocumentation('Schema-compliant shared knowledge graph maintained by OpenCode tools.'),
    metadata: {
      schema: './.opencode/schema/archimate3.1/archimate3.1-exchange-model.schema.json',
      schemaversion: '3.1',
    },
    extensions: {
      ai4pb: {
        managedBy: 'opencode',
        counters: {},
        designSummary: '',
        designDecisions: [],
        runtime: {},
      },
    },
  };
}

export function loadCanonicalKnowledgeGraph(worktree: string): SharedKnowledgeGraph {
  const graphPath = getCanonicalKnowledgeGraphPath(worktree);
  if (!fs.existsSync(graphPath)) {
    const graph = createDefaultSharedKnowledgeGraph();
    saveCanonicalKnowledgeGraph(worktree, graph);
    return graph;
  }
  const raw = fs.readFileSync(graphPath, 'utf8').trim();
  if (!raw) {
    const graph = createDefaultSharedKnowledgeGraph();
    saveCanonicalKnowledgeGraph(worktree, graph);
    return graph;
  }
  return JSON.parse(raw) as SharedKnowledgeGraph;
}

export function saveCanonicalKnowledgeGraph(worktree: string, graph: SharedKnowledgeGraph): void {
  const graphPath = getCanonicalKnowledgeGraphPath(worktree);
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  cleanupEmptySections(graph);
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf8');
}

export function loadLegacyKnowledgeGraph(worktree: string): unknown {
  const graphPath = getLegacyKnowledgeGraphPath(worktree);
  if (!fs.existsSync(graphPath)) {
    return null;
  }
  const raw = fs.readFileSync(graphPath, 'utf8').trim();
  return raw ? JSON.parse(raw) : null;
}

export function nextGraphIdentifier(graph: SharedKnowledgeGraph, prefix: string): string {
  const counters = ensureCounters(graph);
  const current = counters[prefix] ?? 0;
  const next = current + 1;
  counters[prefix] = next;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

export function normalizeElementType(value?: string): string {
  const raw = (value ?? 'BusinessObject').trim();
  const aliases: Record<string, string> = {
    ArchiMate_BusinessActor: 'BusinessActor',
    ArchiMate_BusinessRole: 'BusinessRole',
    ArchiMate_BusinessCollaboration: 'BusinessCollaboration',
    ArchiMate_BusinessProcess: 'BusinessProcess',
    ArchiMate_BusinessFunction: 'BusinessFunction',
    ArchiMate_BusinessService: 'BusinessService',
    ArchiMate_BusinessObject: 'BusinessObject',
    ArchiMate_ApplicationComponent: 'ApplicationComponent',
    ArchiMate_ApplicationService: 'ApplicationService',
    ArchiMate_ApplicationProcess: 'ApplicationProcess',
    ArchiMate_DataObject: 'DataObject',
    ArchiMate_Node: 'Node',
    ArchiMate_Artifact: 'Artifact',
    ArchiMate_Goal: 'Goal',
    ArchiMate_Outcome: 'Outcome',
    ArchiMate_Resource: 'Resource',
    ArchiMate_Capability: 'Capability',
    ArchiMate_CourseOfAction: 'CourseOfAction',
    ArchiMate_ValueStream: 'ValueStream',
    ArchiMate_Requirement: 'Requirement',
    ArchiMate_WorkPackage: 'WorkPackage',
    ArchiMate_Gap: 'Gap',
  };
  return aliases[raw] ?? raw;
}

export function getArchitectureLayerForElementType(type?: string): ArchitectureLayer {
  const normalized = normalizeElementType(type);

  if (['Resource', 'Capability', 'CourseOfAction', 'ValueStream', 'Goal', 'Outcome'].includes(normalized)) {
    return 'strategy';
  }

  if (
    [
      'BusinessActor',
      'BusinessRole',
      'BusinessCollaboration',
      'BusinessInterface',
      'BusinessProcess',
      'BusinessFunction',
      'BusinessInteraction',
      'BusinessEvent',
      'BusinessService',
      'BusinessObject',
      'Contract',
      'Representation',
      'Product',
    ].includes(normalized)
  ) {
    return 'business';
  }

  if (
    [
      'ApplicationComponent',
      'ApplicationCollaboration',
      'ApplicationInterface',
      'ApplicationFunction',
      'ApplicationInteraction',
      'ApplicationProcess',
      'ApplicationEvent',
      'ApplicationService',
      'DataObject',
    ].includes(normalized)
  ) {
    return 'application';
  }

  if (
    [
      'Node',
      'Device',
      'SystemSoftware',
      'TechnologyCollaboration',
      'TechnologyInterface',
      'Path',
      'CommunicationNetwork',
      'TechnologyFunction',
      'TechnologyProcess',
      'TechnologyInteraction',
      'TechnologyEvent',
      'TechnologyService',
      'Artifact',
      'Equipment',
      'Facility',
      'DistributionNetwork',
    ].includes(normalized)
  ) {
    return 'technology';
  }

  return 'other';
}

export function summarizeArchitectureCoverage(graph: SharedKnowledgeGraph): ArchitectureCoverageSummary {
  const byLayer: Record<ArchitectureLayer, number> = {
    strategy: 0,
    business: 0,
    application: 0,
    technology: 0,
    other: 0,
  };

  const architecturalElements = listArchitecturalElements(graph);
  const architecturalRelationships = listArchitecturalRelationships(graph);

  for (const element of architecturalElements) {
    const explicitLayer = (element.extensions?.ai4pb as Record<string, unknown> | undefined)?.layer;
    const layer =
      explicitLayer === 'strategy' ||
      explicitLayer === 'business' ||
      explicitLayer === 'application' ||
      explicitLayer === 'technology' ||
      explicitLayer === 'other'
        ? explicitLayer
        : getArchitectureLayerForElementType(element.type);
    byLayer[layer] += 1;
  }

  const missingCoreLayers = (['strategy', 'business', 'application', 'technology'] as const).filter(
    (layer) => byLayer[layer] === 0
  );

  return {
    totalElements: architecturalElements.length,
    totalRelationships: architecturalRelationships.length,
    byLayer,
    missingCoreLayers: [...missingCoreLayers],
  };
}

export function summarizeIntentionModel(graph: SharedKnowledgeGraph): IntentionModelStatus {
  const architecturalElements = listArchitecturalElements(graph);
  const architecturalRelationships = listArchitecturalRelationships(graph);
  const elementById = new Map(architecturalElements.map((element) => [element.identifier, element]));
  const crossLayerRelationshipCount = architecturalRelationships.filter((relationship) => {
    const source = elementById.get(relationship.source);
    const target = elementById.get(relationship.target);
    if (!source || !target) {
      return false;
    }
    return getArchitectureLayerForElementType(source.type) !== getArchitectureLayerForElementType(target.type);
  }).length;
  const coverage = summarizeArchitectureCoverage(graph);
  const baselineEstablished = coverage.missingCoreLayers.length === 0;

  return {
    architecturalElementCount: architecturalElements.length,
    architecturalRelationshipCount: architecturalRelationships.length,
    crossLayerRelationshipCount,
    baselineEstablished,
    isIntentModelSufficient: baselineEstablished && architecturalElements.length >= 8 && crossLayerRelationshipCount >= 3,
  };
}

export function ensureCoreArchitectureBaseline(
  graph: SharedKnowledgeGraph,
  input: {
    projectGoal?: string;
    designSummary?: string;
  }
): {
  elements: GraphElement[];
  relationships: GraphRelationship[];
  organizations: GraphOrganization[];
  coverage: ArchitectureCoverageSummary;
  intentionModel: IntentionModelStatus;
} {
  const goalLabel = input.projectGoal?.trim() || 'Current Product Goal';
  const summary = input.designSummary?.trim() || input.projectGoal?.trim() || 'Core architecture baseline maintained by SystemArchitect.';

  const strategyGoal = upsertElement(graph, {
    identifier: 'ELM-STRATEGY-GOAL',
    type: 'Goal',
    name: 'Product Delivery Goal',
    documentation: `Primary strategic outcome for: ${goalLabel}. ${summary}`,
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        layer: 'strategy',
        baseline: 'core',
      },
    },
  });

  const strategyCapability = upsertElement(graph, {
    identifier: 'ELM-STRATEGY-CAPABILITY',
    type: 'Capability',
    name: 'Core Product Capability',
    documentation: `Core capability required to achieve: ${goalLabel}.`,
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        layer: 'strategy',
        baseline: 'core',
      },
    },
  });

  const strategyCourse = upsertElement(graph, {
    identifier: 'ELM-STRATEGY-COURSE',
    type: 'CourseOfAction',
    name: 'MVP Delivery Course Of Action',
    documentation: 'Delivery approach that favors a runnable local MVP with explicit architecture-to-implementation traceability.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        layer: 'strategy',
        baseline: 'core',
      },
    },
  });

  const businessActor = upsertElement(graph, {
    identifier: 'ELM-BUSINESS-ACTOR',
    type: 'BusinessActor',
    name: 'Primary User',
    documentation: 'Primary business actor interacting with the product.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        layer: 'business',
        baseline: 'core',
      },
    },
  });

  const business = upsertElement(graph, {
    identifier: 'ELM-BUSINESS-PROCESS',
    type: 'BusinessProcess',
    name: 'Core Business Flow',
    documentation: `Business process baseline that operationalizes the product strategy for: ${goalLabel}.`,
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        layer: 'business',
        baseline: 'core',
      },
    },
  });

  const businessService = upsertElement(graph, {
    identifier: 'ELM-BUSINESS-SERVICE',
    type: 'BusinessService',
    name: 'Core User Service',
    documentation: 'Business-facing service exposed to the primary user through the core business flow.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        layer: 'business',
        baseline: 'core',
      },
    },
  });

  const application = upsertElement(graph, {
    identifier: 'ELM-APPLICATION-COMPONENT',
    type: 'ApplicationComponent',
    name: 'Core Application System',
    documentation: `Application layer baseline that supports the core business flow for: ${goalLabel}.`,
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        layer: 'application',
        baseline: 'core',
      },
    },
  });

  const applicationService = upsertElement(graph, {
    identifier: 'ELM-APPLICATION-SERVICE',
    type: 'ApplicationService',
    name: 'Core Application Service',
    documentation: 'Application service boundary implementing the core business service.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        layer: 'application',
        baseline: 'core',
      },
    },
  });

  const applicationData = upsertElement(graph, {
    identifier: 'ELM-APPLICATION-DATA',
    type: 'DataObject',
    name: 'Core Domain Data',
    documentation: 'Primary domain or state data managed by the application layer.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        layer: 'application',
        baseline: 'core',
      },
    },
  });

  const technology = upsertElement(graph, {
    identifier: 'ELM-TECHNOLOGY-NODE',
    type: 'Node',
    name: 'Core Technology Runtime',
    documentation: `Technology/runtime baseline hosting the core application system for: ${goalLabel}.`,
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        layer: 'technology',
        baseline: 'core',
      },
    },
  });

  const technologyArtifact = upsertElement(graph, {
    identifier: 'ELM-TECHNOLOGY-ARTIFACT',
    type: 'Artifact',
    name: 'Deployable Solution Artifact',
    documentation: 'Deployable build artifact produced from the core application system.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        layer: 'technology',
        baseline: 'core',
      },
    },
  });

  const rel1 = upsertRelationship(graph, {
    identifier: 'REL-CAPABILITY-REALIZES-GOAL',
    type: 'Realization',
    name: 'Capability realizes goal',
    source: strategyCapability.identifier,
    target: strategyGoal.identifier,
    documentation: 'Core product capability realizes the product delivery goal.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const rel2 = upsertRelationship(graph, {
    identifier: 'REL-COURSE-REALIZES-CAPABILITY',
    type: 'Realization',
    name: 'Course realizes capability',
    source: strategyCourse.identifier,
    target: strategyCapability.identifier,
    documentation: 'The MVP delivery course of action realizes the core product capability.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const rel3 = upsertRelationship(graph, {
    identifier: 'REL-BUSINESS-REALIZES-STRATEGY',
    type: 'Realization',
    name: 'Business realizes strategy',
    source: business.identifier,
    target: strategyCapability.identifier,
    documentation: 'Core business flow realizes the strategic capability.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const rel4 = upsertRelationship(graph, {
    identifier: 'REL-ACTOR-ASSIGNED-BUSINESS',
    type: 'Assignment',
    name: 'Actor participates in business flow',
    source: businessActor.identifier,
    target: business.identifier,
    documentation: 'Primary user participates in the core business flow.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const rel5 = upsertRelationship(graph, {
    identifier: 'REL-BUSINESS-PROCESS-REALIZES-SERVICE',
    type: 'Realization',
    name: 'Business process realizes service',
    source: business.identifier,
    target: businessService.identifier,
    documentation: 'Core business flow realizes the core user service.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const rel6 = upsertRelationship(graph, {
    identifier: 'REL-BUSINESS-SERVICE-SERVES-ACTOR',
    type: 'Serving',
    name: 'Business service serves actor',
    source: businessService.identifier,
    target: businessActor.identifier,
    documentation: 'Core user service serves the primary user.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const rel7 = upsertRelationship(graph, {
    identifier: 'REL-APPLICATION-SERVICE-SERVES-BUSINESS',
    type: 'Serving',
    name: 'Application service serves business service',
    source: applicationService.identifier,
    target: businessService.identifier,
    documentation: 'Application service serves the business-facing core user service.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const rel8 = upsertRelationship(graph, {
    identifier: 'REL-APPLICATION-REALIZES-SERVICE',
    type: 'Realization',
    name: 'Application component realizes application service',
    source: application.identifier,
    target: applicationService.identifier,
    documentation: 'Core application system realizes the application service boundary.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const rel9 = upsertRelationship(graph, {
    identifier: 'REL-APPLICATION-ACCESSES-DATA',
    type: 'Access',
    name: 'Application accesses domain data',
    source: application.identifier,
    target: applicationData.identifier,
    documentation: 'Core application system accesses and manages the core domain data.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const rel10 = upsertRelationship(graph, {
    identifier: 'REL-TECHNOLOGY-SUPPORTS-APPLICATION',
    type: 'Association',
    name: 'Technology supports application',
    source: technology.identifier,
    target: application.identifier,
    documentation: 'Core technology runtime supports the application execution environment.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const rel11 = upsertRelationship(graph, {
    identifier: 'REL-TECHNOLOGY-HOSTS-APPLICATION-SERVICE',
    type: 'Serving',
    name: 'Technology hosts application service',
    source: technology.identifier,
    target: applicationService.identifier,
    documentation: 'Core technology runtime hosts the application service boundary.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const rel12 = upsertRelationship(graph, {
    identifier: 'REL-ARTIFACT-REALIZES-APPLICATION',
    type: 'Realization',
    name: 'Artifact realizes application deliverable',
    source: technologyArtifact.identifier,
    target: application.identifier,
    documentation: 'Deployable artifact realizes the application system in deployable form.',
    extensions: {
      ai4pb: {
        managedBy: 'system-architect',
        baseline: 'core',
      },
    },
  });

  const organizations: GraphOrganization[] = [
    createOrganizationRef({
      identifier: 'ORG-INTENTION-ROOT',
      label: 'Intention Architecture',
      documentation: 'Core layered intention model maintained by SystemArchitect.',
      item: [
        createOrganizationRef({
          identifier: 'ORG-INTENTION-STRATEGY',
          label: 'Strategy Layer',
          item: [
            createOrganizationRef({ identifier: 'ORG-REF-STRATEGY-GOAL', label: 'Goal', elementRef: strategyGoal.identifier }),
            createOrganizationRef({ identifier: 'ORG-REF-STRATEGY-CAPABILITY', label: 'Capability', elementRef: strategyCapability.identifier }),
            createOrganizationRef({ identifier: 'ORG-REF-STRATEGY-COURSE', label: 'Course Of Action', elementRef: strategyCourse.identifier }),
          ],
          extensions: { ai4pb: { managedBy: 'system-architect', baseline: 'core' } },
        }),
        createOrganizationRef({
          identifier: 'ORG-INTENTION-BUSINESS',
          label: 'Business Layer',
          item: [
            createOrganizationRef({ identifier: 'ORG-REF-BUSINESS-ACTOR', label: 'Business Actor', elementRef: businessActor.identifier }),
            createOrganizationRef({ identifier: 'ORG-REF-BUSINESS-PROCESS', label: 'Business Process', elementRef: business.identifier }),
            createOrganizationRef({ identifier: 'ORG-REF-BUSINESS-SERVICE', label: 'Business Service', elementRef: businessService.identifier }),
          ],
          extensions: { ai4pb: { managedBy: 'system-architect', baseline: 'core' } },
        }),
        createOrganizationRef({
          identifier: 'ORG-INTENTION-APPLICATION',
          label: 'Application Layer',
          item: [
            createOrganizationRef({ identifier: 'ORG-REF-APPLICATION-COMPONENT', label: 'Application Component', elementRef: application.identifier }),
            createOrganizationRef({ identifier: 'ORG-REF-APPLICATION-SERVICE', label: 'Application Service', elementRef: applicationService.identifier }),
            createOrganizationRef({ identifier: 'ORG-REF-APPLICATION-DATA', label: 'Data Object', elementRef: applicationData.identifier }),
          ],
          extensions: { ai4pb: { managedBy: 'system-architect', baseline: 'core' } },
        }),
        createOrganizationRef({
          identifier: 'ORG-INTENTION-TECHNOLOGY',
          label: 'Technology Layer',
          item: [
            createOrganizationRef({ identifier: 'ORG-REF-TECHNOLOGY-NODE', label: 'Node', elementRef: technology.identifier }),
            createOrganizationRef({ identifier: 'ORG-REF-TECHNOLOGY-ARTIFACT', label: 'Artifact', elementRef: technologyArtifact.identifier }),
          ],
          extensions: { ai4pb: { managedBy: 'system-architect', baseline: 'core' } },
        }),
      ],
      extensions: { ai4pb: { managedBy: 'system-architect', baseline: 'core' } },
    }),
  ];

  for (const organization of organizations) {
    upsertOrganization(graph, organization);
  }

  const coverage = summarizeArchitectureCoverage(graph);
  const intentionModel = summarizeIntentionModel(graph);

  return {
    elements: [
      strategyGoal,
      strategyCapability,
      strategyCourse,
      businessActor,
      business,
      businessService,
      application,
      applicationService,
      applicationData,
      technology,
      technologyArtifact,
    ],
    relationships: [rel1, rel2, rel3, rel4, rel5, rel6, rel7, rel8, rel9, rel10, rel11, rel12],
    organizations,
    coverage,
    intentionModel,
  };
}

export function normalizeRelationshipType(value?: string): string {
  const raw = (value ?? 'Association').trim();
  const aliases: Record<string, string> = {
    ArchiMate_Composition: 'Composition',
    ArchiMate_Aggregation: 'Aggregation',
    ArchiMate_Assignment: 'Assignment',
    ArchiMate_Realization: 'Realization',
    ArchiMate_Serving: 'Serving',
    ArchiMate_Access: 'Access',
    ArchiMate_Influence: 'Influence',
    ArchiMate_Triggering: 'Triggering',
    ArchiMate_Flow: 'Flow',
    ArchiMate_Specialization: 'Specialization',
    ArchiMate_Association: 'Association',
  };
  return aliases[raw] ?? raw;
}

export function findElement(graph: SharedKnowledgeGraph, identifierOrName: string): GraphElement | undefined {
  const needle = identifierOrName.trim();
  return ensureElementArray(graph).find(
    (element) => element.identifier === needle || element.name.some((item) => item.value === needle)
  );
}

export function findRelationship(graph: SharedKnowledgeGraph, identifierOrName: string): GraphRelationship | undefined {
  const needle = identifierOrName.trim();
  return ensureRelationshipArray(graph).find(
    (relationship) => relationship.identifier === needle || relationship.name.some((item) => item.value === needle)
  );
}

function isRuntimeManaged(concept: { extensions?: Record<string, unknown> }): boolean {
  const ai4pb = (concept.extensions?.ai4pb ?? {}) as Record<string, unknown>;
  return ai4pb.managedBy === 'opencode-runtime';
}

function listArchitecturalElements(graph: SharedKnowledgeGraph): GraphElement[] {
  return (graph.elements?.element ?? []).filter((element) => !isRuntimeManaged(element));
}

function listArchitecturalRelationships(graph: SharedKnowledgeGraph): GraphRelationship[] {
  return (graph.relationships?.relationship ?? []).filter((relationship) => !isRuntimeManaged(relationship));
}

function upsertOrganization(graph: SharedKnowledgeGraph, organization: GraphOrganization): GraphOrganization {
  const organizations = ensureOrganizationArray(graph);
  const identifier = organization.identifier?.trim();
  if (identifier) {
    const existing = organizations.find((item) => item.identifier === identifier);
    if (existing) {
      existing.label = organization.label;
      existing.documentation = organization.documentation;
      existing.item = organization.item;
      existing.elementRef = organization.elementRef;
      existing.relationshipRef = organization.relationshipRef;
      existing.conceptRef = organization.conceptRef;
      existing.propertyDefinitionRef = organization.propertyDefinitionRef;
      existing.stereotypeRef = organization.stereotypeRef;
      existing.extensions = organization.extensions;
      return existing;
    }
  }
  organizations.push(organization);
  return organization;
}

function createOrganizationRef(params: {
  identifier: string;
  label: string;
  elementRef?: string;
  relationshipRef?: string;
  documentation?: string;
  item?: GraphOrganization[];
  extensions?: Record<string, unknown>;
}): GraphOrganization {
  return {
    identifier: params.identifier,
    label: toOptionalLabel(params.label),
    documentation: toDocumentation(params.documentation),
    elementRef: params.elementRef,
    relationshipRef: params.relationshipRef,
    item: params.item,
    extensions: params.extensions,
  };
}

export function upsertElement(
  graph: SharedKnowledgeGraph,
  input: {
    identifier?: string;
    type?: string;
    name: string;
    documentation?: string;
    extensions?: Record<string, unknown>;
  }
): GraphElement {
  const identifier = input.identifier?.trim() || nextGraphIdentifier(graph, 'ELM');
  const existing = findElement(graph, identifier);
  if (existing) {
    existing.type = normalizeElementType(input.type ?? existing.type);
    existing.name = toLangString(input.name);
    existing.documentation = toDocumentation(input.documentation);
    existing.extensions = { ...(existing.extensions ?? {}), ...(input.extensions ?? {}) };
    return existing;
  }

  const created: GraphElement = {
    identifier,
    type: normalizeElementType(input.type),
    name: toLangString(input.name),
    documentation: toDocumentation(input.documentation),
    extensions: input.extensions,
  };
  ensureElementArray(graph).push(created);
  return created;
}

export function upsertRelationship(
  graph: SharedKnowledgeGraph,
  input: {
    identifier?: string;
    type?: string;
    name: string;
    source: string;
    target: string;
    documentation?: string;
    extensions?: Record<string, unknown>;
  }
): GraphRelationship {
  const identifier = input.identifier?.trim() || nextGraphIdentifier(graph, 'REL');
  const existing = findRelationship(graph, identifier);
  if (existing) {
    existing.type = normalizeRelationshipType(input.type ?? existing.type);
    existing.name = toLangString(input.name);
    existing.source = input.source;
    existing.target = input.target;
    existing.documentation = toDocumentation(input.documentation);
    existing.extensions = { ...(existing.extensions ?? {}), ...(input.extensions ?? {}) };
    return existing;
  }

  const created: GraphRelationship = {
    identifier,
    type: normalizeRelationshipType(input.type),
    name: toLangString(input.name),
    source: input.source,
    target: input.target,
    documentation: toDocumentation(input.documentation),
    extensions: input.extensions,
  };
  ensureRelationshipArray(graph).push(created);
  return created;
}

function runtimeTaskStatusToMasStatus(status: RuntimeTask['status']): 'ToDo' | 'InProgress' | 'Done' | 'Blocked' {
  if (status === 'in_progress') {
    return 'InProgress';
  }
  if (status === 'done') {
    return 'Done';
  }
  if (status === 'blocked') {
    return 'Blocked';
  }
  return 'ToDo';
}

function issueTypeFromCategory(category: string): 'BugReport' | 'ArchGap' | 'Query' {
  const normalized = category.toLowerCase();
  if (normalized.includes('bug')) {
    return 'BugReport';
  }
  if (normalized.includes('arch')) {
    return 'ArchGap';
  }
  return 'Query';
}

function pruneManagedConcepts(graph: SharedKnowledgeGraph): void {
  if (graph.elements) {
    graph.elements.element = graph.elements.element.filter((element) => {
      const ai4pb = (element.extensions?.ai4pb ?? {}) as Record<string, unknown>;
      return ai4pb.managedBy !== 'opencode-runtime';
    });
  }
  if (graph.relationships) {
    graph.relationships.relationship = graph.relationships.relationship.filter((relationship) => {
      const ai4pb = (relationship.extensions?.ai4pb ?? {}) as Record<string, unknown>;
      return ai4pb.managedBy !== 'opencode-runtime';
    });
  }
}

export function syncRuntimeStateToSharedKnowledgeGraph(graph: SharedKnowledgeGraph, state: RuntimeState): void {
  pruneManagedConcepts(graph);

  const extensions = ensureExtensions(graph);
  const ai4pb = (extensions.ai4pb ??= {}) as Record<string, unknown>;
  ai4pb.designSummary = state.designSummary;
  ai4pb.designDecisions = state.designDecisions;
  ai4pb.runtime = {
    activeGoal: state.activeGoal,
    validations: state.validations,
    release: state.release,
    updatedAt: state.updatedAt,
  };

  const project = upsertElement(graph, {
    identifier: 'PROJECT-CURRENT',
    type: 'WorkPackage',
    name: state.activeGoal || 'Current Project Goal',
    documentation: state.designSummary || state.activeGoal || 'Current OpenCode project goal.',
    extensions: {
      ai4pb: {
        managedBy: 'opencode-runtime',
        kind: 'Project',
        rawRequirement: state.activeGoal,
        status: 'InProgress',
      },
    },
  });

  for (const task of state.tasks) {
    const taskElement = upsertElement(graph, {
      identifier: task.id,
      type: 'WorkPackage',
      name: task.title,
      documentation: task.details ?? task.summary ?? task.title,
      extensions: {
        ai4pb: {
          managedBy: 'opencode-runtime',
          kind: 'Task',
          status: runtimeTaskStatusToMasStatus(task.status),
          assignee: task.owner ?? 'Implementation',
          summary: task.summary ?? '',
          updatedAt: task.updatedAt,
        },
      },
    });
    upsertRelationship(graph, {
      identifier: `REL-PROJECT-${task.id}`,
      type: 'Aggregation',
      name: `Project aggregates ${task.id}`,
      source: project.identifier,
      target: taskElement.identifier,
      documentation: 'Runtime task relationship managed by OpenCode runtime.',
      extensions: {
        ai4pb: {
          managedBy: 'opencode-runtime',
          kind: 'ProjectTaskLink',
        },
      },
    });
  }

  for (const issue of state.issues) {
    upsertElement(graph, {
      identifier: issue.id,
      type: 'BusinessObject',
      name: issue.summary,
      documentation: issue.details ?? issue.summary,
      extensions: {
        ai4pb: {
          managedBy: 'opencode-runtime',
          kind: 'Issue',
          issueType: issueTypeFromCategory(issue.category),
          status: issue.summary.includes('[Resolved]') ? 'Resolved' : 'Open',
          reporter: 'OpenCode',
          category: issue.category,
        },
      },
    });
  }

  if (state.release.status === 'completed') {
    upsertElement(graph, {
      identifier: 'RELEASE-LOG',
      type: 'Artifact',
      name: 'SprintReleaseLog',
      documentation: state.release.summary,
      extensions: {
        ai4pb: {
          managedBy: 'opencode-runtime',
          kind: 'ReleaseLog',
          version: graph.version ?? '1.0.0',
          content: state.release.summary,
          timestamp: state.release.updatedAt,
          path: state.release.releaseLogPath,
        },
      },
    });
  }
}