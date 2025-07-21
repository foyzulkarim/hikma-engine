import { BaseModel } from './base.model';
import { PhaseStatusDTO } from './PhaseStatusDTO';

export class PhaseStatusModel extends BaseModel<PhaseStatusDTO> {
  getTableName(): string {
    return 'phase_status';
  }

  getSchema(): Record<string, string> {
    return {
      id: 'TEXT PRIMARY KEY',
      repo_id: 'TEXT NOT NULL',
      phase_name: 'TEXT NOT NULL',
      status: "TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed'))",
      started_at: 'DATETIME',
      completed_at: 'DATETIME',
      commit_hash: 'TEXT',
      stats: 'TEXT', // JSON
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
      'UNIQUE(repo_id, phase_name)': '',
      'FOREIGN KEY (repo_id)': 'REFERENCES repositories(id) ON DELETE CASCADE'
    };
  }
}