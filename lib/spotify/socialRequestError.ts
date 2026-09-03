export class SocialRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SocialRequestError";
    this.status = status;
  }
}
