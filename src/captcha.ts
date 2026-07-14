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
    private ?string $capError = null;

    public static function getApiEndpoint(): string {
        global $wgCapCaptchaServerUrl, $wgCapCaptchaSiteKey;
        return rtrim( $wgCapCaptchaServerUrl, '/' ) . '/' . rawurlencode( $wgCapCaptchaSiteKey ) . '/';
    }

    public static function getWidgetScriptUrl(): string {
        global $wgCapCaptchaServerUrl;
        return rtrim( $wgCapCaptchaServerUrl, '/' ) . '/assets/widget.js';
    }

    public static function getWidgetScriptTag(): string {
        return Html::rawElement( 'script', [
            'src' => self::getWidgetScriptUrl(),
            'defer' => true,
        ], '' );
    }

    private function getWidgetHtml(): string {
        return Html::rawElement( 'cap-widget', [
            'required' => true,
            'data-cap-api-endpoint' => self::getApiEndpoint(),
            'data-cap-hidden-field-name' => 'g-recaptcha-response',
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
            'g-recaptcha-response',
            $request->getVal( 'captchaWord', $request->getVal( 'captchaword' ) )
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
            self::getApiEndpoint() . 'siteverify',
            [
                'method' => 'POST',
                'postData' => [
                    'secret' => $wgCapCaptchaSecretKey,
                    'response' => $word,
                ],
            ],
            __METHOD__
        );
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
            $params['g-recaptcha-response'] = [
                ApiBase::PARAM_HELP_MSG => 'captcha-apihelp-param-captchaword',
            ];
        }
        return true;
    }

    public function getApiParams(): array {
        return [ 'g-recaptcha-response' ];
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
        $this->mName = 'g-recaptcha-response';
    }

    public function getInputHTML( $value ) {
        $out = $this->mParent->getOutput();
        $out->addHeadItem(
            'cap-captcha-widget',
            Html::rawElement( 'script', [ 'src' => $this->scriptUrl, 'defer' => true ], '' )
        );
        CapCaptcha::addCSPSources( $out->getCSP() );

        return Html::rawElement( 'cap-widget', [
            'required' => true,
            'data-cap-api-endpoint' => $this->endpoint,
            'data-cap-hidden-field-name' => 'g-recaptcha-response',
            'class' => [ 'mw-confirmedit-captcha-fail' => (bool)$this->error ],
        ], '' );
    }
}
`;

export function renderCaptchaSettings(captcha: CaptchaConfig): string {
  if (captcha.provider === "none") return "";
  return `
// Self-hosted Cap CAPTCHA through ConfirmEdit
$wgCapCaptchaServerUrl = getenv( 'CAP_CAPTCHA_SERVER_URL' );
$wgCapCaptchaSiteKey = getenv( 'CAP_CAPTCHA_SITE_KEY' );
$wgCapCaptchaSecretKey = getenv( 'CAP_CAPTCHA_SECRET_KEY' );
wfLoadExtensions( [ 'ConfirmEdit', 'CapCaptcha' ] );
$wgCaptchaClass = MediaWiki\\Extension\\CapCaptcha\\CapCaptcha::class;
$wgCaptchaTriggers['createaccount'] = true;
$wgCaptchaTriggers['badlogin'] = true;
$wgCaptchaTriggers['addurl'] = true;
`;
}

export function captchaLabel(captcha: CaptchaConfig): string {
  return captcha.provider === "cap" ? "Cap.js (self-hosted)" : "None";
}
