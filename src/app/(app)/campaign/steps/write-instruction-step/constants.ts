// Configuration for preview donor count - can be changed later
export const PREVIEW_DONOR_COUNT = process.env.NODE_ENV === 'development' ? 1 : 50;
export const EMAILS_PER_PAGE = 10;
export const GENERATE_MORE_COUNT = process.env.NODE_ENV === 'development' ? 1 : 50;
