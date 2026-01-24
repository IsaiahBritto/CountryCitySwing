import { Resend } from "resend";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Default from email - you can customize this
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

/**
 * Send a simple text email
 */
export const sendMail = async (
  subject: string,
  body: string,
  to?: string,
  from?: string
) => {
  try {
    // Use fallback email if custom domain isn't verified
    const fromEmail = from || FROM_EMAIL;
    let finalFromEmail = fromEmail;

    const { data, error } = await resend.emails.send({
      from: finalFromEmail,
      to: to || "contact.us@countrycityswing.dance",
      subject,
      text: body,
    });

    if (error) {
      // If domain not verified, try with fallback
      if (error.statusCode === 403 && error.message?.includes("not verified")) {
        console.warn(`Domain not verified for ${fromEmail}, using fallback: ${FROM_EMAIL}`);
        const fallbackResult = await resend.emails.send({
          from: FROM_EMAIL,
          to: to || "contact.us@countrycityswing.dance",
          subject,
          text: body,
        });
        if (fallbackResult.error) {
          console.error("Resend fallback error:", fallbackResult.error);
          throw fallbackResult.error;
        }
        return fallbackResult.data;
      }
      console.error("Resend error:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Failed to send email:", error);
    throw error;
  }
};

/**
 * Send an HTML email
 */
export const sendHtmlEmail = async (
  to: string,
  subject: string,
  html: string,
  from?: string
) => {
  try {
    // Validate Resend API key
    if (!process.env.RESEND_API_KEY) {
      const errorMsg = "RESEND_API_KEY is not configured";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Use fallback email if custom domain isn't verified
    const fromEmail = from || FROM_EMAIL;

    console.log(`Attempting to send email to: ${to}, from: ${fromEmail}, subject: ${subject}`);

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend API error:", {
        statusCode: error.statusCode,
        message: error.message,
        name: error.name,
        to,
        from: fromEmail,
        subject,
      });

      // If domain not verified, try with fallback
      if (error.statusCode === 403 && error.message?.includes("not verified")) {
        console.warn(`Domain not verified for ${fromEmail}, using fallback: ${FROM_EMAIL}`);
        const fallbackResult = await resend.emails.send({
          from: FROM_EMAIL,
          to,
          subject,
          html,
        });
        if (fallbackResult.error) {
          console.error("Resend fallback error:", {
            statusCode: fallbackResult.error.statusCode,
            message: fallbackResult.error.message,
            name: fallbackResult.error.name,
            to,
            from: FROM_EMAIL,
            subject,
          });
          throw fallbackResult.error;
        }
        console.log("Email sent successfully using fallback address");
        return fallbackResult.data;
      }
      throw error;
    }

    console.log("Email sent successfully:", { id: data?.id, to, from: fromEmail });
    return data;
  } catch (error: any) {
    console.error("Failed to send HTML email:", {
      error: error?.message || error,
      statusCode: error?.statusCode,
      name: error?.name,
      to,
      subject,
    });
    throw error;
  }
};
