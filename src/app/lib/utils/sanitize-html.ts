import DOMPurify from "dompurify";

/**
 * Sanitizes HTML content to prevent XSS attacks
 * Used for cleaning user-generated HTML content like email signatures
 */
export function sanitizeHtml(html: string): string {
  // Only run DOMPurify on the client side
  if (typeof window === "undefined") {
    // On server-side, we'll return the HTML as-is
    // The actual sanitization will happen client-side before display
    return html;
  }

  const config = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'img', 
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'span', 'div'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height', 
      'target', 'rel', 'class', 'style'
    ],
    ALLOWED_PROTOCOLS: ['http', 'https', 'mailto', 'tel'],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onkeydown', 'onkeyup'],
    // Allow some safe inline styles
    ALLOWED_STYLE_PROPS: [
      'color', 'background-color', 'font-size', 'font-weight', 'font-style',
      'text-decoration', 'text-align', 'margin', 'padding', 'border',
      'width', 'height', 'max-width', 'max-height'
    ]
  };

  // Sanitize the HTML
  const clean = DOMPurify.sanitize(html, config);
  
  // Add target="_blank" and rel="noopener noreferrer" to all links
  const div = document.createElement('div');
  div.innerHTML = clean;
  div.querySelectorAll('a').forEach(link => {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  });
  
  return div.innerHTML;
}

/**
 * Strips all HTML tags from a string
 * Useful for generating plain text versions of HTML content
 */
export function stripHtml(html: string): string {
  if (typeof window === "undefined") {
    // Simple server-side HTML stripping
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
  
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}