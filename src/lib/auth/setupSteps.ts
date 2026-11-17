/**
 * Single source of truth for the browser-mode org setup. Both the /connect
 * wizard and the /install guide render these, so the two can never drift.
 *
 * Text is split into segments so the renderers can style UI labels and
 * values without any HTML strings.
 */
export type Segment = string | { ui: string } | { value: 'callback' | 'origin' };

export interface SetupStep {
  id: string;
  title: string;
  items: Segment[][];
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'app',
    title: 'Create an External Client App you own',
    items: [
      [
        'In Setup, open ',
        { ui: 'External Client App Manager' },
        ' and click ',
        { ui: 'New External Client App' },
        '. Name it ',
        { ui: 'QuantumShield Scanner' },
        ', set your own contact email, and leave Distribution State as ',
        { ui: 'Local' },
        '.',
      ],
      ['Tick ', { ui: 'Enable OAuth' }, ' and add this Callback URL: ', { value: 'callback' }],
      [
        'Selected OAuth scopes: ',
        { ui: 'Manage user data via APIs (api)' },
        ' and ',
        { ui: 'Access the identity URL service (id, profile, email, address, phone)' },
        '. Nothing else: no refresh token, full or web scopes.',
      ],
      [
        'Under Flow Enablement tick ',
        { ui: 'Enable Authorization Code and Credentials Flow' },
        '. Under Security tick ',
        { ui: 'Require Proof Key for Code Exchange (PKCE)' },
        ' and untick ',
        { ui: 'Require secret for Web Server Flow' },
        ' and ',
        { ui: 'Require secret for Refresh Token Flow' },
        '. The browser has no secret to send, so sign-in fails with invalid_client if these stay ticked.',
      ],
      [
        'Create the app. Older orgs without External Client Apps can use a Connected App with the same settings (',
        { ui: 'App Manager → New Connected App' },
        ').',
      ],
    ],
  },
  {
    id: 'cors',
    title: 'Allow this site in CORS',
    items: [
      [
        'In Setup, open ',
        { ui: 'CORS' },
        '. Under ',
        { ui: 'Allowed Origins List' },
        ' click ',
        { ui: 'New' },
        ' and add this origin: ',
        { value: 'origin' },
      ],
      [
        'On the same page, click ',
        { ui: 'Edit' },
        ' and tick ',
        { ui: 'Enable CORS for OAuth endpoints' },
        '. Without it the browser cannot finish sign-in, because the token request is cross-origin.',
      ],
      ['This is once per org. Other people in the org can then sign in without repeating it.'],
    ],
  },
  {
    id: 'key',
    title: 'Copy the Consumer Key',
    items: [
      [
        'Open the app in ',
        { ui: 'External Client App Manager' },
        ', go to ',
        { ui: 'Settings → OAuth Settings' },
        ' and click ',
        { ui: 'Consumer Key and Secret' },
        '. Salesforce asks you to verify your identity, then shows the key. You only need the key, never the secret.',
      ],
      [
        'New or changed OAuth settings can take up to 10 minutes to reach every Salesforce server. If the first sign-in fails, wait a few minutes and try again.',
      ],
    ],
  },
];

/** Plain-text rendering, used for tests and accessible fallbacks. */
export function segmentText(seg: Segment, values: { callback: string; origin: string }): string {
  if (typeof seg === 'string') return seg;
  if ('ui' in seg) return seg.ui;
  return values[seg.value];
}
