import { NextResponse } from 'next/server';

// Define the expected request body shape
interface ContactRequest {
  name: string;
  email: string;
  message: string;
}

/**
 * POST handler for contact form submissions
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
    
    // In a real application, you would use something like:
    /*
    await db.contact.create({
      data: {
        name: body.name,
        email: body.email,
        message: body.message,
        createdAt: new Date(),
      },
    });
    
    // Or send an email
    await sendEmail({
      to: 'info@champagnefestival.com',
      subject: 'New Contact Form Submission',
      text: `Name: ${body.name}\nEmail: ${body.email}\nMessage: ${body.message}`,
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