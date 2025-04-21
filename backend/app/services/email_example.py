"""
Example script demonstrating how to use the email service.
"""

# from app.services.send_email import send_email, send_template_email
from .send_email import send_email, send_template_email

def basic_email_example():
    """Example of sending a basic email"""
    result = send_email(
        recipient_emails=['sandeepdhungana10@gmail.com'],
        subject='Test Email',
        body_html="""
        <html>
        <body>
            <h1>Test Email</h1>
            <p>This is a test email sent from the system.</p>
        </body>
        </html>
        """
    )
    print(f"Basic email result: {result}")

def template_email_example():
    """Example of sending an email using the template system"""
    result = send_template_email(
        recipient_emails=['sandeepdhungana10@gmail.com'],
        subject='Welcome to Our System',
        template_variables={
            'greeting': 'Hello User,',
            'content': '<p>Welcome to our system! We are glad to have you here.</p>',
            'company_name': 'Zainlee Company',
            'contact_info': 'Email: info@zainlee.com | Phone: +1234567890'
        }
    )
    print(f"Template email result: {result}")

def email_with_attachment_example():
    """Example of sending an email with attachment"""
    import os
    
    # Example file path (adjust to a file that exists in your system)
    example_file = os.path.join('..', '..', 'README.md')
    
    result = send_email(
        recipient_emails=['sandeepdhungana10@gmail.com'],
        subject='Email with Attachment',
        body_html="""
        <html>
        <body>
            <h1>Email with Attachment</h1>
            <p>This email contains an attachment.</p>
        </body>
        </html>
        """,
        attachments=[example_file] if os.path.exists(example_file) else []
    )
    print(f"Email with attachment result: {result}")

if __name__ == "__main__":
    print("Running email examples...")
    basic_email_example()
    template_email_example()
    print("Email examples completed.") 