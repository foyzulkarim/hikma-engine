import { BaseDTO } from './base.dto';

export class RepositoryDTO extends BaseDTO {
  repo_path: string;
  repo_name: string;

  constructor(id: string, repo_path: string, repo_name: string) {
    super(id);
    this.repo_path = repo_path;
    this.repo_name = repo_name;
  }
}