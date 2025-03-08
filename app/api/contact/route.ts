import { NextResponse } from 'next/server';

// Define the expected request body shape
interface ContactRequest {
  name: string;
  email: string;
  message: string;
}

/**
 * Processes a contact form submission received via an HTTP POST request.
 *
 * This function parses the JSON body of the incoming request and validates that the required
 * fields ("name", "email", and "message") are included. It also checks that the provided email
 * is in a valid format. Upon successful validation, it simulates processing the submission (e.g.,
 * logging the data) and returns a JSON response with a 201 status code. If any validation fails,
 * it returns a JSON response with a 400 status code. Any unexpected errors result in a 500 response.
 *
 * @param request - An HTTP request containing the contact form data in its JSON body.
 *
 * @returns A JSON response indicating the result of the submission:
 * - 201: Successful processing of the contact form.
 * - 400: Missing required fields or invalid email format.
 * - 500: An error occurred during processing.
 */
export async function POST(request: Request) {
  try {
    // Parse the request body
    const body: ContactRequest = await request.json();
    
    // Validate required fields
    if (!body.name || !body.email || !body.message) {
      return NextResponse.json(
        { message: 'Name, email, and message are required' },
        { status: 400 }
      );
    }
    
    // Validate email format
    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { message: 'Please provide a valid email address' },
        { status: 400 }
      );
    }
    
    // Here we would typically:
    // 1. Save to a database
    // 2. Send an email notification
    // 3. Log the contact request
    // For now, we'll just simulate a successful operation
    
    // For Cloudflare Pages, we need to use Cloudflare-compatible approaches:
    // Option 1: Use Cloudflare Workers Email API:
    /*
    await fetch('https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/email/routing/rules', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: contactConfig.emails.info,
        subject: 'New Contact Form Submission',
        body: `Name: ${body.name}\nEmail: ${body.email}\nMessage: ${body.message}`,
      })
    });
    */
    
    // Option 2: Use an email service with a REST API (SendGrid, Resend, etc.)
    /*
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: contactConfig.emails.sender,
        to: contactConfig.emails.info,
        subject: 'New Contact Form Submission',
        text: `Name: ${body.name}\nEmail: ${body.email}\nMessage: ${body.message}`,
      })
    });
    */
    
    // For logging/debugging purposes
    console.log('Contact form submission:', body);
    
    // Return success response
    return NextResponse.json({ 
      message: 'Your message has been sent successfully' 
    }, { status: 201 });
    
  } catch (error) {
    console.error('Error processing contact form:', error);
    
    return NextResponse.json(
      { message: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}