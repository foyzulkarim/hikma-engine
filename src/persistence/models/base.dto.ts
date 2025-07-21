export abstract class BaseDTO {
  id: string;
  created_at?: string;
  updated_at?: string;

  constructor(id: string) {
    this.id = id;
    this.created_at = new Date().toISOString();
    this.updated_at = new Date().toISOString();
  }
}