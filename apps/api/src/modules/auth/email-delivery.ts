import { AppError } from "../../errors.js";

export interface PasswordResetEmail {
  email: string;
}

export interface EmailDelivery {
  // eslint-disable-next-line no-unused-vars -- Consumers implement the typed email-delivery boundary.
  sendPasswordReset(message: PasswordResetEmail): Promise<void>;
}

export class EmailDeliveryNotConfigured implements EmailDelivery {
  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    void message;
    throw new AppError(
      "EMAIL_DELIVERY_NOT_CONFIGURED",
      503,
      "Password reset email delivery is not configured.",
    );
  }
}
