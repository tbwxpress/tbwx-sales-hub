/**
 * Stage-based suggested replies for franchise sales conversations.
 * {name} and {city} are interpolated from lead data.
 */

export const SUGGESTED_REPLIES: Record<string, { label: string; message: string }[]> = {
  DECK_SENT: [
    { label: 'Deck follow-up', message: 'Hi {name}, did you get a chance to review our franchise deck? Happy to answer any questions!' },
    { label: 'ROI highlight', message: 'Hi {name}, our franchise partners typically see ROI within 8-12 months. Would you like to know more about the investment breakdown?' },
    { label: 'Schedule call', message: 'Hi {name}, shall we schedule a quick 10-min call to walk you through the franchise opportunity?' },
  ],
  REPLIED: [
    { label: 'Thanks + call', message: 'Thanks for your interest, {name}! Would you be available for a quick call today or tomorrow to discuss further?' },
    { label: 'City availability', message: 'Great to hear from you! We do have franchise availability in {city}. Let me share the details for your area.' },
    { label: 'Budget info', message: 'Thanks {name}! Our franchise investment starts from 8-10 lakhs for a kiosk model. Want me to share the full breakdown?' },
  ],
  CALLING: [
    { label: 'Call attempt', message: 'Hi {name}, tried calling you just now. When would be a good time to connect? I have some exciting details about TBWX franchising in {city}.' },
    { label: 'WhatsApp call', message: 'Hi {name}, can I give you a quick call on WhatsApp? It will take just 5-10 minutes to walk you through the opportunity.' },
  ],
  CALL_DONE: [
    { label: 'Post-call summary', message: 'Hi {name}, great speaking with you! As discussed, I\'m sharing the detailed investment breakdown and menu options. Let me know if you have any questions.' },
    { label: 'Visit invite', message: 'Hi {name}, would you like to visit one of our existing outlets in {city} to see the operations firsthand? I can arrange it this week.' },
  ],
  INTERESTED: [
    { label: 'Push for commitment', message: 'Hi {name}, we currently have limited slots available in {city}. Would you like to lock in your franchise spot? I can walk you through the next steps.' },
    { label: 'Partner testimonial', message: 'Hi {name}, one of our partners in a similar city is doing 3-4L monthly revenue. Would you like me to connect you with them for a firsthand experience?' },
    { label: 'Agreement details', message: 'Hi {name}, shall I share the franchise agreement draft? It covers all terms, support, and territory details for {city}.' },
  ],
  NEGOTIATION: [
    { label: 'Address concerns', message: 'Hi {name}, I understand your concerns. Let me address them one by one — what\'s the biggest question on your mind right now?' },
    { label: 'Limited time', message: 'Hi {name}, just a heads up — we have 2 other inquiries for {city}. I\'d love for you to get first priority. Can we finalize this week?' },
  ],
  DELAYED: [
    { label: 'Re-engage', message: 'Hi {name}, hope you\'re doing well! Just checking in — are you still interested in the TBWX franchise opportunity? We have some exciting updates to share.' },
    { label: 'New outlets', message: 'Hi {name}, we\'ve opened 3 new outlets recently and the response has been amazing. Would you like to revisit the franchise opportunity for {city}?' },
  ],
}
