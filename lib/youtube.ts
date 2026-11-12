import { google } from 'googleapis';

export function oauthClient(origin: string) {
  return new google.auth.OAuth2(process.env.YT_CLIENT_ID, process.env.YT_CLIENT_SECRET, `${origin}/api/oauth/youtube/callback`);
}
