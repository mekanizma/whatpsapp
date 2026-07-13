/**
 * Çok dilli randevu onay kelimeleri — şablon dilleriyle uyumlu (TR, EN, DE, AR, RU, FR, ES)
 */

export const STRONG_CONFIRM_PATTERN =
  /^(evet|onayl?[iıİI]yorum|onaylıyorum|onayliyorum|onaylad[ıi]m|onayladim|onay|kabul\s*ediyorum|kabul\s*ederim|kesinlikle|tabii|tabi|aynen|doğrudur|dogrudur|doğru|dogru|yes|ja|oui|si|sí|نعم|أؤكد|да|подтверждаю|confirmo|confirme|bestätigen|bestatigen)(?:\s|$|[.!])/iu;

export const WEAK_CONFIRM_PATTERN =
  /^(tamam|tamamdır|tamamdir|uygun|olur|kabul|ok|okay|d'accord|vale|bien|doğrudur|dogrudur|doğru|dogru|peki)\s*$/iu;

export const CONFIRM_WORDS_PATTERN =
  /^(evet|onayl?[iıİI]yorum|onaylıyorum|onayliyorum|onaylad[ıi]m|onayladim|onay|tamam|tamamdır|tamamdir|uygun|olur|kabul|ok|okay|doğrudur|dogrudur|doğru|dogru|yes|ja|oui|si|sí|نعم|أؤكد|да|подтверждаю|confirmo|confirme|bestätigen|bestatigen|hayır|hayir|no|nein|non)$/iu;

export const CONFIRM_ONLY_PATTERN =
  /^(evet|onayl?[iıİI]yorum|onaylıyorum|onayliyorum|onaylad[ıi]m|onayladim|onay|tamam|tamamdır|tamamdir|uygun|olur|kabul|ok|okay|doğrudur|dogrudur|doğru|dogru|yes|ja|oui|si|sí|نعم|أؤكد|да|подтверждаю|confirmo|confirme|bestätigen|bestatigen|[1-9]|1[0-5])\s*$/iu;

export const PENDING_CONFIRM_PATTERN =
  /onaylıyor musunuz|onayliyor musunuz|bilgileri onaylıyor|randevu özeti|onaylıyor musun|doğru mu|dogru mu|not alıyorum|not aliyorum|do you confirm|appointment summary|bestätigen sie|confirmez-vous|confirma estos|¿confirma|bestätigen sie diese|confirm these details/i;
