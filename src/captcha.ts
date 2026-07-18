import type { CaptchaConfig } from "./config";

export const CAP_EXTENSION_MANIFEST = `${JSON.stringify({
  name: "CapCaptcha",
  author: ["MediaWiki Autosetup contributors"],
  url: "https://github.com/tiagozip/cap",
  description: "Connects MediaWiki ConfirmEdit to a self-hosted Cap CAPTCHA server.",
  "license-name": "MIT",
  type: "antispam",
  AutoloadClasses: {
    "MediaWiki\\Extension\\CapCaptcha\\CapCaptcha": "includes/CapCaptcha.php",
    "MediaWiki\\Extension\\CapCaptcha\\CapCaptchaAuthenticationRequest": "includes/CapCaptchaAuthenticationRequest.php",
    "MediaWiki\\Extension\\CapCaptcha\\HTMLCapCaptchaField": "includes/HTMLCapCaptchaField.php",
  },
  requires: { MediaWiki: ">= 1.46" },
  manifest_version: 2,
}, null, 2)}\n`;

export const CAP_CAPTCHA_CLASS = `<?php

declare( strict_types=1 );

namespace MediaWiki\\Extension\\CapCaptcha;

use MediaWiki\\Api\\ApiBase;
use MediaWiki\\Auth\\AuthenticationRequest;
use MediaWiki\\Context\\RequestContext;
use MediaWiki\\Extension\\ConfirmEdit\\Auth\\CaptchaAuthenticationRequest;
use MediaWiki\\Extension\\ConfirmEdit\\SimpleCaptcha\\SimpleCaptcha;
use MediaWiki\\Extension\\ConfirmEdit\\Services\\CaptchaFactory;
use MediaWiki\\Html\\Html;
use MediaWiki\\Json\\FormatJson;
use MediaWiki\\MediaWikiServices;
use MediaWiki\\Output\\OutputPage;

class CapCaptcha extends SimpleCaptcha {
    public const TOKEN_FIELD = 'cap-token';

    private ?string $capError = null;

    public static function getApiEndpoint(): string {
        global $wgCapCaptchaServerUrl, $wgCapCaptchaSiteKey;
        return rtrim( $wgCapCaptchaServerUrl, '/' ) . '/' . rawurlencode( $wgCapCaptchaSiteKey ) . '/';
    }

    public static function getWidgetScriptUrl(): string {
        global $wgCapCaptchaServerUrl;
        return rtrim( $wgCapCaptchaServerUrl, '/' ) . '/assets/widget.js';
    }

    public static function getVerificationEndpoint(): string {
        global $wgCapCaptchaInternalServerUrl, $wgCapCaptchaServerUrl, $wgCapCaptchaSiteKey;
        $serverUrl = $wgCapCaptchaInternalServerUrl ?? $wgCapCaptchaServerUrl;
        return rtrim( $serverUrl, '/' ) . '/' . rawurlencode( $wgCapCaptchaSiteKey ) . '/siteverify';
    }

    public static function getWidgetScriptTag(): string {
        return Html::rawElement( 'script', [
            'src' => self::getWidgetScriptUrl(),
            'type' => 'module',
            'defer' => true,
        ], '' );
    }

    private function getWidgetHtml(): string {
        return Html::rawElement( 'cap-widget', [
            'required' => true,
            'data-cap-api-endpoint' => self::getApiEndpoint(),
            'data-cap-hidden-field-name' => self::TOKEN_FIELD,
            'class' => [ 'mw-confirmedit-captcha-fail' => (bool)$this->capError ],
        ], '' );
    }

    public function getFormInformation( $tabIndex = 1, ?OutputPage $out = null ) {
        return [
            'html' => $this->getWidgetHtml(),
            'headitems' => [ self::getWidgetScriptTag() ],
        ];
    }

    public static function getCSPUrls() {
        global $wgCapCaptchaServerUrl;
        return [ $wgCapCaptchaServerUrl ];
    }

    public static function addCSPSources( $csp ) {
        parent::addCSPSources( $csp );
        foreach ( self::getCSPUrls() as $url ) {
            $csp->addDefaultSrc( $url );
        }
    }

    protected function getCaptchaParamsFromRequest( $request ) {
        $response = $request->getVal(
            self::TOKEN_FIELD,
            $request->getVal(
                'captchaWord',
                $request->getVal( 'captchaword', $request->getVal( 'g-recaptcha-response' ) )
            )
        );
        return [ 'not used', $response ];
    }

    protected function addCaptchaAPI( &$resultArr ) {
        $resultArr['captcha'] = $this->describeCaptchaType( $this->action );
        $resultArr['captcha']['error'] = $this->capError;
    }

    protected function passCaptcha( $_, $word, $user ) {
        global $wgCapCaptchaSecretKey;

        if ( !is_string( $word ) || $word === '' ) {
            $this->capError = 'missing-token';
            return false;
        }

        $request = MediaWikiServices::getInstance()->getHttpRequestFactory()->create(
            self::getVerificationEndpoint(),
            [
                'method' => 'POST',
                'postData' => FormatJson::encode( [
                    'secret' => $wgCapCaptchaSecretKey,
                    'response' => $word,
                ] ),
                'timeout' => 10,
            ],
            __METHOD__
        );
        $request->setHeader( 'Content-Type', 'application/json' );
        $status = $request->execute();
        if ( !$status->isOK() ) {
            $this->capError = 'http';
            wfDebugLog( 'captcha', 'Cap token verification request failed.' );
            return false;
        }

        $response = FormatJson::decode( $request->getContent(), true );
        if ( !is_array( $response ) ) {
            $this->capError = 'json';
            wfDebugLog( 'captcha', 'Cap token verification returned invalid JSON.' );
            return false;
        }

        $success = (bool)( $response['success'] ?? false );
        if ( !$success ) {
            $this->capError = 'rejected';
            wfDebugLog( 'captcha', 'Cap rejected a CAPTCHA token.' );
        }
        return $success;
    }

    public function describeCaptchaType( ?string $action = null ) {
        return [
            'type' => 'cap',
            'mime' => 'application/javascript',
            'endpoint' => self::getApiEndpoint(),
        ];
    }

    public function getError() {
        return $this->capError;
    }

    public function apiGetAllowedParams( ApiBase $module, &$params, $flags ) {
        if ( $flags && $this->isAPICaptchaModule( $module ) ) {
            $params[self::TOKEN_FIELD] = [
                ApiBase::PARAM_HELP_MSG => 'captcha-apihelp-param-captchaword',
            ];
        }
        return true;
    }

    public function getApiParams(): array {
        return [ self::TOKEN_FIELD ];
    }

    public function storeCaptcha( $info ) {
        return 'not used';
    }

    public function retrieveCaptcha( $index ) {
        return [ 'index' => $index ];
    }

    public function getCaptcha() {
        return [];
    }

    public function createAuthenticationRequest() {
        return new CapCaptchaAuthenticationRequest();
    }

    public function onAuthChangeFormFields(
        array $requests, array $fieldInfo, array &$formDescriptor, $action
    ) {
        $req = AuthenticationRequest::getRequestByClass(
            $requests,
            CaptchaAuthenticationRequest::class,
            true
        );
        if ( !$req ) {
            return;
        }

        /** @var CaptchaFactory $captchaFactory */
        $captchaFactory = MediaWikiServices::getInstance()->get( 'ConfirmEditCaptchaFactory' );
        $captcha = $captchaFactory->getGlobalInstanceFromAuthenticationRequest(
            $req,
            RequestContext::getMain()->getRequest()->getSession()
        );

        $formDescriptor['captchaWord'] = [
            'class' => HTMLCapCaptchaField::class,
            'endpoint' => self::getApiEndpoint(),
            'scriptUrl' => self::getWidgetScriptUrl(),
            'error' => $captcha->getError(),
        ] + $formDescriptor['captchaWord'];
    }
}
`;

export const CAP_CAPTCHA_AUTHENTICATION_REQUEST = `<?php

declare( strict_types=1 );

namespace MediaWiki\\Extension\\CapCaptcha;

use MediaWiki\\Auth\\AuthenticationRequest;
use MediaWiki\\Extension\\ConfirmEdit\\Auth\\CaptchaAuthenticationRequest;

class CapCaptchaAuthenticationRequest extends CaptchaAuthenticationRequest {
    public function __construct() {
        parent::__construct( '', [] );
    }

    public function loadFromSubmission( array $data ) {
        if ( isset( $data[CapCaptcha::TOKEN_FIELD] ) && !isset( $data['captchaWord'] ) ) {
            $data['captchaWord'] = $data[CapCaptcha::TOKEN_FIELD];
        }
        if ( isset( $data['g-recaptcha-response'] ) && !isset( $data['captchaWord'] ) ) {
            $data['captchaWord'] = $data['g-recaptcha-response'];
        }
        return AuthenticationRequest::loadFromSubmission( $data );
    }

    public function getFieldInfo() {
        $fieldInfo = parent::getFieldInfo();
        return [
            'captchaWord' => [
                'type' => 'string',
                'label' => $fieldInfo['captchaInfo']['label'],
                'help' => wfMessage( 'captcha-help' ),
            ],
        ];
    }
}
`;

export const CAP_CAPTCHA_FIELD = `<?php

declare( strict_types=1 );

namespace MediaWiki\\Extension\\CapCaptcha;

use MediaWiki\\Html\\Html;
use MediaWiki\\HTMLForm\\HTMLFormField;

class HTMLCapCaptchaField extends HTMLFormField {
    protected $endpoint;
    protected $scriptUrl;
    protected $error;

    public function __construct( array $params ) {
        $params += [ 'error' => null ];
        parent::__construct( $params );
        $this->endpoint = $params['endpoint'];
        $this->scriptUrl = $params['scriptUrl'];
        $this->error = $params['error'];
        $this->mName = CapCaptcha::TOKEN_FIELD;
    }

    public function getInputHTML( $value ) {
        $out = $this->mParent->getOutput();
        $out->addHeadItem(
            'cap-captcha-widget',
            Html::rawElement( 'script', [
                'src' => $this->scriptUrl,
                'type' => 'module',
                'defer' => true,
            ], '' )
        );
        CapCaptcha::addCSPSources( $out->getCSP() );

        return Html::rawElement( 'cap-widget', [
            'required' => true,
            'data-cap-api-endpoint' => $this->endpoint,
            'data-cap-hidden-field-name' => CapCaptcha::TOKEN_FIELD,
            'class' => [ 'mw-confirmedit-captcha-fail' => (bool)$this->error ],
        ], '' );
    }
}
`;

export const CAP_INIT_SCRIPT = `import { chmod, rename, writeFile } from "node:fs/promises";

const credentialsPath = "/cap-data/credentials.json";
const temporaryPath = "/cap-data/credentials.json.tmp";
const capUrl = "http://cap:3000";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Missing required Cap setup value: " + name);
  return value;
}

async function logIn(): Promise<string> {
  const response = await fetch(capUrl + "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ admin_key: requiredEnvironment("CAP_STANDALONE_ADMIN_KEY") }),
  });
  if (!response.ok) throw new Error("Cap login is not ready.");
  const session = await response.json() as { session_token?: string; hashed_token?: string };
  if (!session.session_token || !session.hashed_token) throw new Error("Cap login failed.");
  return Buffer.from(JSON.stringify({
    token: session.session_token,
    hash: session.hashed_token,
  })).toString("base64");
}

let authorization = "";
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    authorization = "Bearer " + await logIn();
    break;
  } catch {
    if (attempt === 59) throw new Error("Cap did not become ready within two minutes.");
    await Bun.sleep(2_000);
  }
}

let existingCredentials: { siteKey: string; secretKey: string } | undefined;
try {
  existingCredentials = JSON.parse(await Bun.file(credentialsPath).text());
} catch {
  existingCredentials = undefined;
}

const headers = { authorization, "content-type": "application/json" };
const keysResponse = await fetch(capUrl + "/server/keys", { headers });
if (!keysResponse.ok) throw new Error("Could not inspect Cap site keys.");
const keys = await keysResponse.json() as Array<{ siteKey?: string }>;
if (existingCredentials && keys.some(({ siteKey }) => siteKey === existingCredentials?.siteKey)) {
  console.log("Cap site key is already configured.");
  process.exit(0);
}

const createResponse = await fetch(capUrl + "/server/keys", {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: "MediaWiki Autosetup",
    instrumentation: true,
    corsOrigins: [new URL(requiredEnvironment("WIKI_URL")).origin],
  }),
});
if (!createResponse.ok) throw new Error("Could not create the Cap site key.");
const credentials = await createResponse.json() as { siteKey?: string; secretKey?: string };
if (!credentials.siteKey || !credentials.secretKey) {
  throw new Error("Cap returned incomplete site credentials.");
}

await writeFile(temporaryPath, JSON.stringify(credentials) + "\\n", { mode: 0o600 });
await rename(temporaryPath, credentialsPath);
await chmod(credentialsPath, 0o444);
console.log("Cap site key created.");
`;

export function renderCaptchaSettings(captcha: CaptchaConfig): string {
  if (captcha.provider === "none") return "";
  const triggers = `
$wgCaptchaTriggers['createaccount'] = true;
$wgCaptchaTriggers['badlogin'] = true;
$wgCaptchaTriggers['addurl'] = true;
`;
  if (captcha.provider === "cap" && captcha.deployment === "automatic") return `
// Automatically managed Cap CAPTCHA through ConfirmEdit
$capCredentialsJson = file_get_contents( '/run/cap/credentials.json' );
$capCredentials = is_string( $capCredentialsJson )
    ? json_decode( $capCredentialsJson, true )
    : null;
if ( !is_array( $capCredentials )
    || !isset( $capCredentials['siteKey'], $capCredentials['secretKey'] )
) {
    throw new RuntimeException( 'Automatic Cap credentials are missing or invalid.' );
}
$wgCapCaptchaServerUrl = getenv( 'CAP_CAPTCHA_SERVER_URL' );
$wgCapCaptchaInternalServerUrl = 'http://cap:3000';
$wgCapCaptchaSiteKey = $capCredentials['siteKey'];
$wgCapCaptchaSecretKey = $capCredentials['secretKey'];
wfLoadExtensions( [ 'ConfirmEdit', 'CapCaptcha' ] );
$wgCaptchaClass = MediaWiki\\Extension\\CapCaptcha\\CapCaptcha::class;
${triggers}`;
  if (captcha.provider === "cap") return `
// Self-hosted Cap CAPTCHA through ConfirmEdit
$wgCapCaptchaServerUrl = getenv( 'CAP_CAPTCHA_SERVER_URL' );
$wgCapCaptchaSiteKey = getenv( 'CAP_CAPTCHA_SITE_KEY' );
$wgCapCaptchaSecretKey = getenv( 'CAP_CAPTCHA_SECRET_KEY' );
wfLoadExtensions( [ 'ConfirmEdit', 'CapCaptcha' ] );
$wgCaptchaClass = MediaWiki\\Extension\\CapCaptcha\\CapCaptcha::class;
${triggers}`;
  if (captcha.provider === "turnstile") return `
// Cloudflare Turnstile through ConfirmEdit
$wgTurnstileSiteKey = getenv( 'TURNSTILE_SITE_KEY' );
$wgTurnstileSecretKey = getenv( 'TURNSTILE_SECRET_KEY' );
$wgTurnstileSendRemoteIP = false;
wfLoadExtensions( [ 'ConfirmEdit', 'ConfirmEdit/Turnstile' ] );
$wgCaptchaClass = MediaWiki\\Extension\\ConfirmEdit\\Turnstile\\Turnstile::class;
${triggers}`;
  if (captcha.provider === "hcaptcha") return `
// hCaptcha through ConfirmEdit
$wgHCaptchaSiteKey = getenv( 'HCAPTCHA_SITE_KEY' );
$wgHCaptchaSecretKey = getenv( 'HCAPTCHA_SECRET_KEY' );
$wgHCaptchaSendRemoteIP = false;
wfLoadExtensions( [ 'ConfirmEdit', 'ConfirmEdit/hCaptcha' ] );
$wgCaptchaClass = MediaWiki\\Extension\\ConfirmEdit\\hCaptcha\\HCaptcha::class;
${triggers}`;
  return `
// Google reCAPTCHA v2 through ConfirmEdit
$wgReCaptchaSiteKey = getenv( 'RECAPTCHA_SITE_KEY' );
$wgReCaptchaSecretKey = getenv( 'RECAPTCHA_SECRET_KEY' );
$wgReCaptchaSendRemoteIP = false;
wfLoadExtensions( [ 'ConfirmEdit', 'ConfirmEdit/ReCaptchaNoCaptcha' ] );
$wgCaptchaClass = MediaWiki\\Extension\\ConfirmEdit\\ReCaptchaNoCaptcha\\ReCaptchaNoCaptcha::class;
${triggers}`;
}

export function captchaEnvironmentVariables(captcha: CaptchaConfig): Array<[string, string]> {
  switch (captcha.provider) {
    case "cap":
      if (captcha.deployment === "automatic") {
        return [
          ["CAP_CAPTCHA_SERVER_URL", captcha.serverUrl],
          ["CAP_STANDALONE_PORT", String(captcha.port)],
          ["CAP_STANDALONE_ADMIN_KEY", captcha.adminKey],
        ];
      }
      return [
        ["CAP_CAPTCHA_SERVER_URL", captcha.serverUrl],
        ["CAP_CAPTCHA_SITE_KEY", captcha.siteKey],
        ["CAP_CAPTCHA_SECRET_KEY", captcha.secretKey],
      ];
    case "turnstile":
      return [
        ["TURNSTILE_SITE_KEY", captcha.siteKey],
        ["TURNSTILE_SECRET_KEY", captcha.secretKey],
      ];
    case "hcaptcha":
      return [
        ["HCAPTCHA_SITE_KEY", captcha.siteKey],
        ["HCAPTCHA_SECRET_KEY", captcha.secretKey],
      ];
    case "recaptcha":
      return [
        ["RECAPTCHA_SITE_KEY", captcha.siteKey],
        ["RECAPTCHA_SECRET_KEY", captcha.secretKey],
      ];
    case "none":
      return [];
  }
}

export function mediaWikiCaptchaEnvironmentNames(captcha: CaptchaConfig): string[] {
  if (captcha.provider === "cap" && captcha.deployment === "automatic") {
    return ["CAP_CAPTCHA_SERVER_URL"];
  }
  return captchaEnvironmentVariables(captcha).map(([name]) => name);
}

export function captchaLabel(captcha: CaptchaConfig): string {
  switch (captcha.provider) {
    case "cap": return captcha.deployment === "automatic"
      ? "Cap.js (automatic server)"
      : "Cap.js (existing server)";
    case "turnstile": return "Cloudflare Turnstile";
    case "hcaptcha": return "hCaptcha";
    case "recaptcha": return "Google reCAPTCHA v2";
    case "none": return "None";
  }
}
