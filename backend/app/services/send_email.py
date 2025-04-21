import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from typing import List, Optional
from dotenv import load_dotenv
import logging
from datetime import datetime

# Load environment variables if .env file exists
current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(os.path.dirname(current_dir), '.env')
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)

# Email configuration
EMAIL_SENDER = os.getenv('EMAIL_SENDER')
EMAIL_PASSWORD = os.getenv('EMAIL_PASSWORD')
SMTP_SERVER = os.getenv('SMTP_SERVER')
SMTP_PORT = int(os.getenv('SMTP_PORT'))
SMTP_USE_TLS = os.getenv('SMTP_USE_TLS').lower() == 'true'

# Configure logging
logger = logging.getLogger(__name__)

# Email configuration for HR
HR_EMAIL = os.getenv('HR_EMAIL', 'hr@zainlee.com')
COMPANY_NAME = os.getenv('COMPANY_NAME', 'Zainlee')

def send_email(
    recipient_emails: List[str],
    subject: str,
    body_html: str,
    body_text: Optional[str] = None,
    attachments: Optional[List[str]] = None,
    cc_emails: Optional[List[str]] = None,
    bcc_emails: Optional[List[str]] = None,
) -> dict:
    """
    Send an email using the configured SMTP server.
    
    Args:
        recipient_emails: List of recipient email addresses
        subject: Email subject
        body_html: HTML content of the email
        body_text: Plain text content of the email (optional)
        attachments: List of file paths to attach (optional)
        cc_emails: List of CC email addresses (optional)
        bcc_emails: List of BCC email addresses (optional)
        
    Returns:
        dict: Result of the email sending operation
    """
    if not recipient_emails:
        return {"success": False, "message": "No recipients specified"}
    
    # Create message
    msg = MIMEMultipart('alternative')
    msg['From'] = EMAIL_SENDER
    msg['To'] = ', '.join(recipient_emails)
    msg['Subject'] = subject
    
    # Add CC if provided
    if cc_emails:
        msg['Cc'] = ', '.join(cc_emails)
        
    # Add text part if provided, otherwise create from HTML
    if body_text:
        msg.attach(MIMEText(body_text, 'plain'))
    else:
        # Create a simple text version if not provided
        import re
        text_content = re.sub('<.*?>', '', body_html)
        msg.attach(MIMEText(text_content, 'plain'))
    
    # Add HTML part
    msg.attach(MIMEText(body_html, 'html'))
    
    # Add attachments if provided
    if attachments:
        for file_path in attachments:
            try:
                with open(file_path, 'rb') as file:
                    attachment = MIMEApplication(file.read())
                    attachment.add_header(
                        'Content-Disposition', 
                        'attachment', 
                        filename=os.path.basename(file_path)
                    )
                    msg.attach(attachment)
            except Exception as e:
                return {
                    "success": False,
                    "message": f"Failed to attach file {file_path}: {str(e)}"
                }
    
    try:
        # Determine all recipients for sending
        all_recipients = recipient_emails.copy()
        if cc_emails:
            all_recipients.extend(cc_emails)
        if bcc_emails:
            all_recipients.extend(bcc_emails)
            
        # Connect to SMTP server and send email
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            # Use STARTTLS for encryption (as specified in requirements)
            server.starttls()
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.sendmail(EMAIL_SENDER, all_recipients, msg.as_string())
            
        return {"success": True, "message": "Email sent successfully"}
    
    except Exception as e:
        logger.error(f"Error sending email: {str(e)}", exc_info=True)
        return {"success": False, "message": f"Failed to send email: {str(e)}"}


def send_template_email(
    recipient_emails: List[str],
    subject: str,
    template_variables: dict,
    template_name: str = "default",
    attachments: Optional[List[str]] = None,
    cc_emails: Optional[List[str]] = None,
    bcc_emails: Optional[List[str]] = None,
) -> dict:
    """
    Send an email using a template.
    
    Args:
        recipient_emails: List of recipient email addresses
        subject: Email subject
        template_variables: Dictionary of variables to be replaced in the template
        template_name: Name of the template to use (optional)
        attachments: List of file paths to attach (optional)
        cc_emails: List of CC email addresses (optional)
        bcc_emails: List of BCC email addresses (optional)
        
    Returns:
        dict: Result of the email sending operation
    """
    # Simple default template
    default_template = """
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .footer { margin-top: 30px; font-size: 12px; color: #777; }
        </style>
    </head>
    <body>
        <div class="container">
            <p>{{greeting}}</p>
            <div>{{content}}</div>
            <div class="footer">
                <p>{{company_name}}</p>
                <p>{{contact_info}}</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    # Template selection logic (can be expanded)
    templates = {
        "default": default_template,
        # Add more templates as needed
    }
    
    template = templates.get(template_name, default_template)
    
    # Simple template variable replacement
    for key, value in template_variables.items():
        template = template.replace("{{" + key + "}}", str(value))
    
    # Send the email with the rendered template
    return send_email(
        recipient_emails=recipient_emails,
        subject=subject,
        body_html=template,
        attachments=attachments,
        cc_emails=cc_emails,
        bcc_emails=bcc_emails
    )

# New attendance notification functions

def send_attendance_notification(
    employee_data: dict,
    notification_type: str,
    employee_email: Optional[str] = None,
    notify_hr: bool = True
) -> dict:
    """
    Send an attendance notification email based on the notification type.
    
    Args:
        employee_data: Dictionary containing employee attendance data
        notification_type: Type of notification ('entry', 'exit', 'late_entry', 'early_exit')
        employee_email: Email address of the employee (optional)
        notify_hr: Whether to notify HR (default: True)
        
    Returns:
        dict: Result of the email sending operation
    """
    name = employee_data.get('name', '')
    employee_id = employee_data.get('employee_id', '')
    timestamp = employee_data.get('timestamp', '')
    
    # Format timestamp if it's a string
    if isinstance(timestamp, str):
        try:
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            formatted_time = dt.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, TypeError):
            formatted_time = timestamp
    else:
        formatted_time = timestamp
    
    # Format entry and exit times if available
    entry_time = employee_data.get('entry_time', '')
    if isinstance(entry_time, str) and entry_time:
        try:
            dt = datetime.fromisoformat(entry_time.replace('Z', '+00:00'))
            formatted_entry_time = dt.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, TypeError):
            formatted_entry_time = entry_time
    else:
        formatted_entry_time = entry_time
    
    exit_time = employee_data.get('exit_time', '')
    if isinstance(exit_time, str) and exit_time:
        try:
            dt = datetime.fromisoformat(exit_time.replace('Z', '+00:00'))
            formatted_exit_time = dt.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, TypeError):
            formatted_exit_time = exit_time
    else:
        formatted_exit_time = "Not recorded yet"
    
    # Format late duration in a readable way
    late_duration_str = "None"
    
    # Get late time components if available
    time_components = employee_data.get('time_components', {})
    
    if time_components:
        late_hours = time_components.get('hours', 0)
        late_minutes = time_components.get('minutes', 0)
        late_seconds = time_components.get('seconds', 0)
        
        # Format late time
        parts = []
        if late_hours > 0:
            parts.append(f"{late_hours} hour{'s' if late_hours != 1 else ''}")
        if late_minutes > 0:
            parts.append(f"{late_minutes} minute{'s' if late_minutes != 1 else ''}")
        if late_seconds > 0:
            parts.append(f"{late_seconds} second{'s' if late_seconds != 1 else ''}")
        
        if parts:
            late_duration_str = ", ".join(parts)
    else:
        # Fallback to minutes_late if time_components not available
        minutes_late = employee_data.get('minutes_late')
        if minutes_late and isinstance(minutes_late, (int, float)) and minutes_late > 0:
            hours = minutes_late // 60
            minutes = minutes_late % 60
            
            parts = []
            if hours > 0:
                parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
            if minutes > 0:
                parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")
                
            if parts:
                late_duration_str = ", ".join(parts)
            else:
                late_duration_str = "Less than a minute"
    
    # Define recipients
    recipients = []
    if employee_email:
        recipients.append(employee_email)
    if notify_hr:
        recipients.append(HR_EMAIL)
    
    if not recipients:
        return {"success": False, "message": "No recipients specified"}
    
    # Create table header
    attendance_details = f'''
        <table style="border-collapse: collapse; width: 100%; margin-top: 15px; margin-bottom: 15px;">
            <tr style="background-color: #f2f2f2;">
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Detail</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Value</th>
            </tr>
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">Employee ID</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{employee_id}</td>
            </tr>
    '''
    
    # Add different rows based on notification type
    if notification_type in ['entry', 'late_entry']:
        # For entry and late entry, show entry time and late duration
        attendance_details += f'''
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">Entry Time</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{formatted_entry_time}</td>
            </tr>
        '''
        
        # Only show late duration for late entry
        if notification_type == 'late_entry':
            attendance_details += f'''
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">Late Duration</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">{late_duration_str}</td>
                </tr>
            '''
    
    elif notification_type in ['exit', 'early_exit']:
        # For exit and early exit, show both entry and exit times
        attendance_details += f'''
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">Entry Time</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{formatted_entry_time}</td>
            </tr>
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">Exit Time</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{formatted_exit_time}</td>
            </tr>
        '''
    
    # Close the table
    attendance_details += f'''
        </table>
    '''
    
    # Configure email content based on notification type
    if notification_type == 'entry':
        subject = f"Attendance: Entry Recorded for {name} ({employee_id})"
        template_vars = {
            'greeting': f'Hello {name},',
            'content': f'<p>Your entry has been recorded at <strong>{formatted_time}</strong>.</p>' +
                      attendance_details +
                      f'<p>Have a productive day!</p>',
            'company_name': COMPANY_NAME,
            'contact_info': f'Email: {HR_EMAIL}'
        }
    
    elif notification_type == 'exit':
        subject = f"Attendance: Exit Recorded for {name} ({employee_id})"
        template_vars = {
            'greeting': f'Hello {name},',
            'content': f'<p>Your exit has been recorded at <strong>{formatted_time}</strong>.</p>' +
                      attendance_details +
                      f'<p>Thank you for your work today!</p>',
            'company_name': COMPANY_NAME,
            'contact_info': f'Email: {HR_EMAIL}'
        }
    
    elif notification_type == 'late_entry':
        late_message = employee_data.get('late_message', 'You were late today.')
        subject = f"Attendance Alert: Late Entry for {name} ({employee_id})"
        template_vars = {
            'greeting': f'Hello {name},',
            'content': f'<p>Your entry has been recorded at <strong>{formatted_time}</strong>.</p>' +
                      f'<p><strong>Note:</strong> {late_message}</p>' +
                      attendance_details +
                      f'<p>Please ensure timely arrival in the future.</p>',
            'company_name': COMPANY_NAME,
            'contact_info': f'Email: {HR_EMAIL}'
        }
    
    elif notification_type == 'early_exit':
        early_exit_message = employee_data.get('early_exit_message', 'You left early today.')
        subject = f"Attendance Alert: Early Exit for {name} ({employee_id})"
        template_vars = {
            'greeting': f'Hello {name},',
            'content': f'<p>Your exit has been recorded at <strong>{formatted_time}</strong>.</p>' +
                      f'<p><strong>Note:</strong> {early_exit_message}</p>' +
                      attendance_details +
                      f'<p>If this was an approved early departure, please disregard this message.</p>',
            'company_name': COMPANY_NAME,
            'contact_info': f'Email: {HR_EMAIL}'
        }
    else:
        return {"success": False, "message": f"Invalid notification type: {notification_type}"}
    
    # Send email using the template system
    try:
        return send_template_email(
            recipient_emails=recipients,
            subject=subject,
            template_variables=template_vars
        )
    except Exception as e:
        logger.error(f"Error sending attendance notification: {str(e)}", exc_info=True)
        return {"success": False, "message": f"Failed to send notification: {str(e)}"}


def send_entry_notification(employee_data: dict, employee_email: Optional[str] = None) -> dict:
    """Send notification for employee entry"""
    return send_attendance_notification(
        employee_data=employee_data,
        notification_type='entry',
        employee_email=employee_email
    )


def send_exit_notification(employee_data: dict, employee_email: Optional[str] = None) -> dict:
    """Send notification for employee exit"""
    return send_attendance_notification(
        employee_data=employee_data,
        notification_type='exit',
        employee_email=employee_email
    )


def send_late_entry_notification(employee_data: dict, employee_email: Optional[str] = None) -> dict:
    """Send notification for late entry"""
    return send_attendance_notification(
        employee_data=employee_data,
        notification_type='late_entry',
        employee_email=employee_email
    )


def send_early_exit_notification(employee_data: dict, employee_email: Optional[str] = None) -> dict:
    """Send notification for early exit"""
    return send_attendance_notification(
        employee_data=employee_data,
        notification_type='early_exit',
        employee_email=employee_email
    )

def send_welcome_email(
    employee_data: dict,
    employee_email: Optional[str] = None,
    notify_hr: bool = True
) -> dict:
    """
    Send a welcome email to a newly registered employee.
    
    Args:
        employee_data: Dictionary containing employee data
        employee_email: Email address of the employee (optional)
        notify_hr: Whether to notify HR (default: True)
        
    Returns:
        dict: Result of the email sending operation
    """
    name = employee_data.get('name', '')
    employee_id = employee_data.get('employee_id', '')
    department = employee_data.get('department', '')
    position = employee_data.get('position', '')
    
    # Define recipients
    recipients = []
    if employee_email:
        recipients.append(employee_email)
    if notify_hr:
        recipients.append(HR_EMAIL)
    
    if not recipients:
        return {"success": False, "message": "No recipients specified"}
    
    # Configure welcome email content
    subject = f"Welcome to {COMPANY_NAME}, {name}!"
    
    template_vars = {
        'greeting': f'Hello {name},',
        'content': f'''
            <p>Welcome to the {COMPANY_NAME} team! We're thrilled to have you join us as a {position} in the {department} department.</p>
            <p>Your employee ID is: <strong>{employee_id}</strong></p>
            <p>This is to inform you that your face recognition profile has been successfully registered in our attendance system.</p>
            <p>From now on, the system will automatically record your attendance when you enter and exit the premises.</p>
            <p>If you have any questions about the attendance system or need assistance, please contact the HR department.</p>
            <p>We look forward to your contributions and wish you a successful journey with us!</p>
        ''',
        'company_name': COMPANY_NAME,
        'contact_info': f'Email: {HR_EMAIL}'
    }
    
    # Send email using the template system
    try:
        return send_template_email(
            recipient_emails=recipients,
            subject=subject,
            template_variables=template_vars
        )
    except Exception as e:
        logger.error(f"Error sending welcome email: {str(e)}", exc_info=True)
        return {"success": False, "message": f"Failed to send welcome email: {str(e)}"}
