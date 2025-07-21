import { BaseDTO } from './base.dto';

export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed';

export class PhaseStatusDTO extends BaseDTO {
  repo_id: string;
  phase_name: string;
  status: PhaseStatus;
  started_at?: string;
  completed_at?: string;
  commit_hash?: string;
  stats?: string; // JSON string for phase-specific stats

  constructor(
    id: string,
    repo_id: string,
    phase_name: string,
    status: PhaseStatus = 'pending'
  ) {
    super(id);
    this.repo_id = repo_id;
    this.phase_name = phase_name;
    this.status = status;
  }
}