// A requested match or game doesn't exist. The API answers 404.
export class NotFoundError extends Error {}

// A request refers to something that can't be used, such as an unknown
// player. The API answers 400.
export class BadRequestError extends Error {}
