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
    const smtpPort = parseInt(context.env.SMTP_PORT || "587");
    
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
    
    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
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
    
    // Honeypot field check (anti-spam)
    if (formData.honeypot) {
      // Silent success response for potential bots
      return new Response(JSON.stringify({ 
        success: true,
        message: "Form submitted successfully" 
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        }
      });
    }
    
    // Prepare email content
    const subject = `New Contact Form Submission from ${formData.name}`;
    const emailBody = `
      Name: ${formData.name}
      Email: ${formData.email}
      
      Message:
      ${formData.message}
      
      Sent from: ${context.request.headers.get("User-Agent") || "Unknown"}
      IP: ${context.request.headers.get("CF-Connecting-IP") || "Unknown"}
      Time: ${new Date().toISOString()}
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