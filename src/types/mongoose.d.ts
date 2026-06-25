// Widen ConnectOptions to accept serverSelectionTimeoutMS
declare module 'mongoose' {
  interface ConnectOptions {
    serverSelectionTimeoutMS?: number;
    heartbeatFrequencyMS?: number;
  }
}

// Widen IndexOptions to accept expireAfterSeconds
declare module 'mongoose' {
  interface IndexOptions {
    expireAfterSeconds?: number;
  }
}

export {};
