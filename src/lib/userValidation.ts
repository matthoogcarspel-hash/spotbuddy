const ADMIN_EMAIL_EXCEPTION = 'matthoogcarspel@gmail.com';

export const blockedWords = [
  'fuck',
  'fck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'dick',
  'pussy',
  'kanker',
  'hoer',
  'tering',
  'lul',
  'neuk',
  'sex',
  'sexy',
  'porn',
  'nazi',
  'hitler',
  'rape',
  'slut',
  'whore',
  'penis',
  'vagina',
  'boobs',
  'nude',
  'nsfw',
];

export const normalizeUserInput = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isAdminEmailException = (email: string) => normalizeEmail(email) === ADMIN_EMAIL_EXCEPTION;

export const hasRestrictedWord = (username: string) => {
  const normalizedUsername = normalizeUserInput(username);
  return blockedWords.some((word) => normalizedUsername.includes(word));
};

export const hasBlockedSpotbuddyName = (username: string, email: string) => {
  if (isAdminEmailException(email)) {
    return false;
  }

  const normalizedUsername = normalizeUserInput(username);
  return normalizedUsername.includes('spotbuddy');
};
