/**
 * Cloudflare Function for contact form handling
 * This will receive form submissions and send emails using Cloudflare's Email Workers
 */
export async function onRequestPost(context) {
  try {
    // Parse the request body as JSON
    const formData = await context.request.json();

    // Get environment variables
    const recipientEmail = context.env.CONTACT_EMAIL || "info@champagnefestival.be";
    const smtpHostname = context.env.SMTP_HOSTNAME;
    const smtpUsername = context.env.SMTP_USERNAME;
    const smtpPassword = context.env.SMTP_PASSWORD;
    const recaptchaSecret = context.env.RECAPTCHA_SECRET_KEY;

    // Get request information
    const userAgent = context.request.headers.get("User-Agent") || "Unknown";
    const ipAddress = context.request.headers.get("CF-Connecting-IP") || "Unknown";
    const referer = context.request.headers.get("Referer") || "Unknown";

    // Anti-spam check 1: Check for honeypot field (should be empty)
    if (formData.honeypot) {
      console.log(`Potential spam detected (honeypot): IP: ${ipAddress}, UA: ${userAgent}`);

      // Return consistent response structure without confirming success
      // Internal flag indicates spam detection for monitoring purposes
      return new Response(JSON.stringify({
        success: false,
        message: "Message processing failed. Please try again later.",
        _internal: { flagged: true, reason: "honeypot" }
      }), {
        status: 422, // Unprocessable Entity
        headers: {
          "Content-Type": "application/json",
        }
      });
    }

    // Anti-spam check 2: Check submission timestamp (too fast = bot)
    const submissionTime = new Date();
    const formStartTime = formData.formStartTime ? new Date(formData.formStartTime) : null;

    if (formStartTime && submissionTime - formStartTime < 3000) { // Less than 3 seconds
      console.log(`Potential spam detected (too fast): IP: ${ipAddress}, Time: ${submissionTime - formStartTime}ms`);

      return new Response(JSON.stringify({
        success: false,
        message: "Your submission was too quick. Please try again."
      }), {
        status: 429, // Too many requests
        headers: {
          "Content-Type": "application/json",
        }
      });
    }

    // Anti-spam check 3: reCAPTCHA validation if enabled
    if (recaptchaSecret && formData.recaptchaToken) {
      try {
        const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `secret=${recaptchaSecret}&response=${formData.recaptchaToken}`
        });

        const recaptchaResult = await recaptchaResponse.json();

        if (!recaptchaResult.success || recaptchaResult.score < 0.5) {
          console.log(`reCAPTCHA failed: IP: ${ipAddress}, Score: ${recaptchaResult.score}`);

          return new Response(JSON.stringify({
            success: false,
            message: "Security verification failed. Please try again."
          }), {
            status: 403,
            headers: {
              "Content-Type": "application/json",
            }
          });
        }
      } catch (recaptchaError) {
        console.error("reCAPTCHA verification error:", recaptchaError);
        return new Response(JSON.stringify({
          success: false,
          message: "Security verification failed. Please try again later."
        }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          }
        });
      }
    }

    // Validate the form data
    if (!formData.name || !formData.email || !formData.message) {
      return new Response(JSON.stringify({
        success: false,
        message: "Missing required fields"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        }
      });
    }

    // Comprehensive email validation
    const emailRegex = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
    
    // Additional validation checks
    const isValidEmail = (email) => {
      // Basic regex check
      if (!emailRegex.test(email)) return false;
      
      // Check email length limits (local part max 64, domain max 253, total max 320)
      const [localPart, domain] = email.split('@');
      if (localPart.length > 64 || domain.length > 253 || email.length > 320) return false;
      
      // Check for consecutive dots
      if (email.includes('..')) return false;
      
      // Check for valid domain structure
      const domainParts = domain.split('.');
      if (domainParts.length < 2 || domainParts.some(part => part.length === 0)) return false;
      
      return true;
    };
    
    if (!isValidEmail(formData.email)) {
      return new Response(JSON.stringify({
        success: false,
        message: "Invalid email address"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        }
      });
    }

    // Sanitize form data to prevent XSS and injection attacks
    const sanitizeText = (text) => {
      if (typeof text !== 'string') return '';
      // Remove HTML tags first, then escape special characters in single pass
      return text
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[&<>"'`]/g, (match) => {
          const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '`': '&#x60;'
          };
          return escapeMap[match];
        })
        .trim();
    };

    const sanitizedName = sanitizeText(formData.name);
    const sanitizedEmail = sanitizeText(formData.email);
    const sanitizedMessage = sanitizeText(formData.message);

    // Prepare email content with sanitized data
    const subject = `New Contact Form Submission from ${sanitizedName}`;
    const emailBody = `
      Name: ${sanitizedName}
      Email: ${sanitizedEmail}
      
      Message:
      ${sanitizedMessage}
      
      Sent from: ${userAgent}
      IP: ${ipAddress}
      Referrer: ${referer}
      Time: ${submissionTime.toISOString()}
    `;

    // Log the email data for debugging
    console.log("Email content:", {
      to: recipientEmail,
      from: `Contact Form <${smtpUsername}>`,
      subject: subject,
      text: emailBody
    });

    // Check if email credentials are configured
    if (!smtpHostname || !smtpUsername || !smtpPassword) {
      console.log("SMTP credentials not configured - would have sent email with:", subject);

      return new Response(JSON.stringify({
        success: true,
        message: "Thank you for your message! We'll get back to you soon."
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        }
      });
    }

    // Send email using Email Workers
    // Note: In a real implementation, you'd use Workers configuration to connect to SMTP
    // or use the Cloudflare Email Workers API to send email
    // This is a placeholder for integration with your preferred email service
    try {
      // Create a new message object
      const message = {
        to: recipientEmail,
        from: `"Contact Form" <${smtpUsername}>`,
        subject: subject,
        text: emailBody,
        replyTo: formData.email
      };

      // In actual implementation, this would connect to SMTP or use Cloudflare Email API
      // For now we just log it was attempted
      console.log("Would send email:", message);

      // Return a success response
      return new Response(JSON.stringify({
        success: true,
        message: "Thank you for your message! We'll get back to you soon."
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        }
      });

    } catch (emailError) {
      console.error("Error sending email:", emailError);

      return new Response(JSON.stringify({
        success: false,
        message: "Error sending email. Please try again later."
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        }
      });
    }

  } catch (error) {
    // Log the error
    console.error("Contact form error:", error);

    // Return an error response
    return new Response(JSON.stringify({
      success: false,
      message: "An error occurred while processing your request"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      }
    });
  }
}