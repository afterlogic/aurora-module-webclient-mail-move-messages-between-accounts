<?php
/**
 * This code is licensed under AGPLv3 license or Afterlogic Software License
 * if commercial version of the product was purchased.
 * For full statements of the licenses see LICENSE-AFTERLOGIC and LICENSE-AGPL3 files.
 */

namespace Aurora\Modules\MailMoveMessagesBetweenAccountsWebclient;

use Aurora\Modules\Mail;

/**
 * @license https://www.gnu.org/licenses/agpl-3.0.html AGPL-3.0
 * @license https://afterlogic.com/products/common-licensing Afterlogic Software License
 * @copyright Copyright (c) 2023, Afterlogic Corp.
 *
 * @package Modules
 */
class Module extends \Aurora\System\Module\AbstractModule
{
    public function init()
    {
    }

    /**
     *
     * @return Module
     */
    public static function Decorator()
    {
        return parent::Decorator();
    }

    /**
     *
     * @return Settings
     */
    public function getModuleSettings()
    {
        return $this->oModuleSettings;
    }

    /**
     * Obtains list of module settings.
     * @return array
     */
    public function GetSettings()
    {
        \Aurora\System\Api::checkUserRoleIsAtLeast(\Aurora\System\Enums\UserRole::NormalUser);

        return [
            'NumberOfRecordsInHistory' => $this->getConfig('NumberOfRecordsInHistory', 3)
        ];
    }

    public function MoveMessages($AccountID, $ToAccountID, $Folder, $ToFolder, $Uids)
    {
        $mResult = false;

        \Aurora\System\Api::checkUserRoleIsAtLeast(\Aurora\System\Enums\UserRole::NormalUser);

        $aUids = \Aurora\System\Utils::ExplodeIntUids((string) $Uids);

        if (0 === \strlen(\trim($Folder)) || 0 === \strlen(\trim($ToFolder)) || !\is_array($aUids) || 0 === \count($aUids)) {
            throw new \Aurora\System\Exceptions\ApiException(\Aurora\System\Notifications::InvalidInputParameter);
        }

        /** @var \Aurora\Modules\Mail\Module $oMailModule */
        $oMailModule = \Aurora\Api::GetModule('Mail');
        if ($oMailModule) {
            $oAccount = $oMailModule->getAccountsManager()->getAccountById($AccountID);
            Mail\Module::checkAccess($oAccount);

            $oToAccount = $oMailModule->getAccountsManager()->getAccountById($ToAccountID);
            Mail\Module::checkAccess($oToAccount);

            try {
                $oImapClient = $oMailModule->getMailManager()->_getImapClient($oToAccount);

                $aFlags = $oMailModule->getMailManager()->getMessagesFlags($oAccount, $Folder, $aUids);

                foreach ($aUids as $iUid) {
                    $aAppendFlags = isset($aFlags[$iUid]) && in_array('\\seen', $aFlags[$iUid]) ? [\MailSo\Imap\Enumerations\MessageFlag::SEEN] : null;
                    $oMailModule->getMailManager()->directMessageToStream(
                        $oAccount,
                        function ($rResource) use ($oImapClient, $ToFolder, $aAppendFlags) {
                            if (\is_resource($rResource)) {
                                $rMessageStream = \MailSo\Base\ResourceRegistry::CreateMemoryResource();

                                $iMessageStreamSize = \MailSo\Base\Utils::MultipleStreamWriter(
                                    $rResource,
                                    array($rMessageStream),
                                    8192,
                                    true,
                                    true
                                );

                                if (false !== $iMessageStreamSize && is_resource($rMessageStream)) {
                                    rewind($rMessageStream);

                                    $iNewUid = 0;

                                    $oImapClient->MessageAppendStream($ToFolder, $rMessageStream, $iMessageStreamSize, $aAppendFlags, $iNewUid);
                                }
                            }
                        },
                        $Folder,
                        $iUid
                    );
                }
                $oMailModule->getMailManager()->deleteMessage($oAccount, $Folder, $aUids);
                $mResult = true;
            } catch (\MailSo\Imap\Exceptions\NegativeResponseException $oException) {
                $oResponse = /* @var $oResponse \MailSo\Imap\Response */ $oException->GetLastResponse();
                throw new \Aurora\Modules\Mail\Exceptions\Exception(
                    Mail\Enums\ErrorCodes::CannotMoveMessageQuota,
                    $oException,
                    $oResponse instanceof \MailSo\Imap\Response ? $oResponse->Tag.' '.$oResponse->StatusOrIndex.' '.$oResponse->HumanReadable : ''
                );
            } catch (\Exception $oException) {
                throw new \Aurora\Modules\Mail\Exceptions\Exception(
                    Mail\Enums\ErrorCodes::CannotMoveMessage,
                    $oException,
                    $oException->getMessage()
                );
            }

            return $mResult;
        }
    }
}
