import {
  CostHint,
  NodeId,
  Dag,
  NodeRegistry,
  Validator,
  ValidationReport,
} from '@mini-math/workflow'

import { Program } from './ir.js'

export interface CompileEstimate {
  total: CostHint
  perNode: Record<NodeId, CostHint>
}

export interface CompileArtifact {
  program: Program
  validation: ValidationReport
  estimate: CompileEstimate
}

export abstract class Compiler {
  abstract compile(dag: Dag, registry: NodeRegistry, validator: Validator): CompileArtifact
}
