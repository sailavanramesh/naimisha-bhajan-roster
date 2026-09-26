import { prisma } from "@/lib/db";

/**
 * scripts/seedChants.ts — the two ashtottaras, in Devanagari and IAST.
 *
 *     npx tsx scripts/seedChants.ts
 *     npx tsx scripts/seedChants.ts --force
 *
 * WHERE THE WORDS CAME FROM. The Devanagari is transcribed from the "Shirdi
 * Ashtottaram" epub Sailavan supplied, which carries both ashtottarams — his
 * copy is the authority here, not anything off the web.
 *
 * The IAST is transliterated DOWN from that Devanagari, which is exact:
 * Devanagari records vowel length and every conjunct, so nothing has to be
 * guessed. Building Devanagari UP from a romanisation, which is what an earlier
 * pass at this did, has to guess at both. That is also why lib/toDevanagari.ts
 * is not involved — it is for the other direction, and it guesses at Hindi
 * schwa deletion, which Sanskrit does not have.
 *
 * IDEMPOTENT, and cautious about it: a chant whose verses have been edited
 * since they were seeded is left completely alone, because these are devotional
 * texts the group will correct by hand and nobody should lose that to a re-run.
 * `--force` overrides it, and is for the one case that is not a hand edit — the
 * SOURCE text itself being corrected, which is what happened when the epub
 * replaced a web transcription. It rewrites the words and keeps the row.
 *
 * Twelve names a verse, nine verses: an ashtottara is recited in stretches and
 * a 108-line wall is no use to anybody following along.
 */

const force = process.argv.includes("--force");

const CHANTS = [
  {
    title: "Shirdi Sai Ashtottara Shatanamavali",
    tradition: "Ashtottara · 108 names",
    language: "Sanskrit",
    verses: [
      { label: "Names 1–12", script: "ॐ श्री साई नाथाय नमः\nॐ श्री लक्ष्मीनारायणाय नमः\nॐ श्री कृष्णरामशिव मारुत्यादिरुपाय नमः\nॐ श्री शेषशायिने नमः\nॐ श्री गोदावरीतट शीलाधिवासिने नमः\nॐ श्री भक्त हृदयालयाय नमः\nॐ श्री सर्वहृद्वासिने नमः\nॐ श्री भूतावासाय नमः\nॐ श्री भूत भविष्यद्भाववर्जिताय नमः\nॐ श्री कालातीताय नमः\nॐ श्री कालाय नमः\nॐ श्री कालकालाय नमः", roman: "oṁ śrī sāī nāthāya namaḥ\noṁ śrī lakṣmīnārāyaṇāya namaḥ\noṁ śrī kṛṣṇarāmaśiva mārutyādirupāya namaḥ\noṁ śrī śeṣaśāyine namaḥ\noṁ śrī godāvarītaṭa śīlādhivāsine namaḥ\noṁ śrī bhakta hṛdayālayāya namaḥ\noṁ śrī sarvahṛdvāsine namaḥ\noṁ śrī bhūtāvāsāya namaḥ\noṁ śrī bhūta bhaviṣyadbhāvavarjitāya namaḥ\noṁ śrī kālātītāya namaḥ\noṁ śrī kālāya namaḥ\noṁ śrī kālakālāya namaḥ" },
      { label: "Names 13–24", script: "ॐ श्री कालदर्प दमनाय नमः\nॐ श्री मृत्युञ्जयाय नमः\nॐ श्री अमर्त्याय नमः\nॐ श्री मर्त्याभयप्रदाय नमः\nॐ श्री जीवाधाराय नमः\nॐ श्री सर्वाधाराय नमः\nॐ श्री भक्तावनसमर्थाय नमः\nॐ श्री भक्तावनप्रतिज्ञाय नमः\nॐ श्री अन्नवस्त्रदाय नमः\nॐ श्री आरोग्यक्षेमदाय नमः\nॐ श्री धनमाङ्गल्यप्रदाय नमः\nॐ श्री ऋद्धिसिद्धिदाय नमः", roman: "oṁ śrī kāladarpa damanāya namaḥ\noṁ śrī mṛtyuñjayāya namaḥ\noṁ śrī amartyāya namaḥ\noṁ śrī martyābhayapradāya namaḥ\noṁ śrī jīvādhārāya namaḥ\noṁ śrī sarvādhārāya namaḥ\noṁ śrī bhaktāvanasamarthāya namaḥ\noṁ śrī bhaktāvanapratijñāya namaḥ\noṁ śrī annavastradāya namaḥ\noṁ śrī ārogyakṣemadāya namaḥ\noṁ śrī dhanamāṅgalyapradāya namaḥ\noṁ śrī ṛddhisiddhidāya namaḥ" },
      { label: "Names 25–36", script: "ॐ श्री पुत्रमित्रकलत्रबन्धुदाय नमः\nॐ श्री योगक्षेमवहाय नमः\nॐ श्री आपद्बान्धवाय नमः\nॐ श्री मार्गबन्धवे नमः\nॐ श्री भुक्तिमुक्तिस्वर्गापवर्गदाय नमः\nॐ श्री प्रियाय नमः\nॐ श्री प्रीति वर्धनाय नमः\nॐ श्री अन्तर्यामिणे नमः\nॐ श्री सच्चिदात्मने नमः\nॐ श्री नित्यानन्दाय नमः\nॐ श्री परम सुखदाय नमः\nॐ श्री परमेश्वराय नमः", roman: "oṁ śrī putramitrakalatrabandhudāya namaḥ\noṁ śrī yogakṣemavahāya namaḥ\noṁ śrī āpadbāndhavāya namaḥ\noṁ śrī mārgabandhave namaḥ\noṁ śrī bhuktimuktisvargāpavargadāya namaḥ\noṁ śrī priyāya namaḥ\noṁ śrī prīti vardhanāya namaḥ\noṁ śrī antaryāmiṇe namaḥ\noṁ śrī saccidātmane namaḥ\noṁ śrī nityānandāya namaḥ\noṁ śrī parama sukhadāya namaḥ\noṁ śrī parameśvarāya namaḥ" },
      { label: "Names 37–48", script: "ॐ श्री परब्रह्मणे नमः\nॐ श्री परमात्मने नमः\nॐ श्री ज्ञान स्वरूपिणे नमः\nॐ श्री जगतः पित्रे नमः\nॐ श्री भक्तानां मातृ दातृ पितामहाय नमः\nॐ श्री भक्ताभय प्रदाय नमः\nॐ श्री भक्त पराधीनाय नमः\nॐ श्री भक्तानुग्रह कातराय नमः\nॐ श्री शरणागत वत्सलाय नमः\nॐ श्री भक्ति शक्ति प्रदाय नमः\nॐ श्री ज्ञान वैराग्यदाय नमः\nॐ श्री प्रेम प्रदाय नमः", roman: "oṁ śrī parabrahmaṇe namaḥ\noṁ śrī paramātmane namaḥ\noṁ śrī jñāna svarūpiṇe namaḥ\noṁ śrī jagataḥ pitre namaḥ\noṁ śrī bhaktānāṁ mātṛ dātṛ pitāmahāya namaḥ\noṁ śrī bhaktābhaya pradāya namaḥ\noṁ śrī bhakta parādhīnāya namaḥ\noṁ śrī bhaktānugraha kātarāya namaḥ\noṁ śrī śaraṇāgata vatsalāya namaḥ\noṁ śrī bhakti śakti pradāya namaḥ\noṁ śrī jñāna vairāgyadāya namaḥ\noṁ śrī prema pradāya namaḥ" },
      { label: "Names 49–60", script: "ॐ श्री संशय हृदय दौर्बल्य पाप कर्म वासना क्षयकराय नमः\nॐ श्री हृदयग्रन्थि भेदकाय नमः\nॐ श्री कर्म ध्वंसिने नमः\nॐ श्री शुद्धसत्त्व स्थिताय नमः\nॐ श्री गुणातीत गुणात्मने नमः\nॐ श्री अनन्त कल्यान गुणाय नमः\nॐ श्री अमित पराक्रमाय नमः\nॐ श्री जयिने नमः\nॐ श्री दुर्धर्ष क्षोभ्याय नमः\nॐ श्री अपराजिताय नमः\nॐ श्री त्रिलोकेषु अविघातकतये नमः\nॐ श्री अशक्य रहिताय नमः", roman: "oṁ śrī saṁśaya hṛdaya daurbalya pāpa karma vāsanā kṣayakarāya namaḥ\noṁ śrī hṛdayagranthi bhedakāya namaḥ\noṁ śrī karma dhvaṁsine namaḥ\noṁ śrī śuddhasattva sthitāya namaḥ\noṁ śrī guṇātīta guṇātmane namaḥ\noṁ śrī ananta kalyāna guṇāya namaḥ\noṁ śrī amita parākramāya namaḥ\noṁ śrī jayine namaḥ\noṁ śrī durdharṣa kṣobhyāya namaḥ\noṁ śrī aparājitāya namaḥ\noṁ śrī trilokeṣu avighātakataye namaḥ\noṁ śrī aśakya rahitāya namaḥ" },
      { label: "Names 61–72", script: "ॐ श्री सर्व शक्ति मूर्त्तये नमः\nॐ श्री स्वरूप सुन्दराय नमः\nॐ श्री सुलोचनाय नमः\nॐ श्री बहुरूप विश्वमूर्त्तये नमः\nॐ श्री अरूपाव्यक्ताय नमः\nॐ श्री अचिन्त्याय नमः\nॐ श्री सूक्ष्माय नमः\nॐ श्री सर्वान्तर्यामिने नमः\nॐ श्री मनोवागतीताय नमः\nॐ श्री प्रेम मूर्त्तये नमः\nॐ श्री सुलभ दुर्लभाय नमः\nॐ श्री असहाय सहायाय नमः", roman: "oṁ śrī sarva śakti mūrttaye namaḥ\noṁ śrī svarūpa sundarāya namaḥ\noṁ śrī sulocanāya namaḥ\noṁ śrī bahurūpa viśvamūrttaye namaḥ\noṁ śrī arūpāvyaktāya namaḥ\noṁ śrī acintyāya namaḥ\noṁ śrī sūkṣmāya namaḥ\noṁ śrī sarvāntaryāmine namaḥ\noṁ śrī manovāgatītāya namaḥ\noṁ śrī prema mūrttaye namaḥ\noṁ śrī sulabha durlabhāya namaḥ\noṁ śrī asahāya sahāyāya namaḥ" },
      { label: "Names 73–84", script: "ॐ श्री अनाथ नाथ दीनबन्धवे नमः\nॐ श्री सर्वभार भृते नमः\nॐ श्री अकर्मानेककर्म सुकर्मिणे नमः\nॐ श्री पुण्यश्रवण कीर्तनाय नमः\nॐ श्री तीर्थाय नमः\nॐ श्री वासुदेवाय नमः\nॐ श्री सतां गतये नमः\nॐ श्री सत्परायणाय नमः\nॐ श्री लोकनाथाय नमः\nॐ श्री पावानाङ्गाय नमः\nॐ श्री अमृतांशवे नमः\nॐ श्री भास्कर प्रभाय नमः", roman: "oṁ śrī anātha nātha dīnabandhave namaḥ\noṁ śrī sarvabhāra bhṛte namaḥ\noṁ śrī akarmānekakarma sukarmiṇe namaḥ\noṁ śrī puṇyaśravaṇa kīrtanāya namaḥ\noṁ śrī tīrthāya namaḥ\noṁ śrī vāsudevāya namaḥ\noṁ śrī satāṁ gataye namaḥ\noṁ śrī satparāyaṇāya namaḥ\noṁ śrī lokanāthāya namaḥ\noṁ śrī pāvānāṅgāya namaḥ\noṁ śrī amṛtāṁśave namaḥ\noṁ śrī bhāskara prabhāya namaḥ" },
      { label: "Names 85–96", script: "ॐ श्री ब्रह्मचर्य तपश्चर्यादि सुव्रताय नमः\nॐ श्री सत्यधर्म परायणाय नमः\nॐ श्री सिद्धेश्वराय नमः\nॐ श्री सिद्ध सङ्कल्पाय नमः\nॐ श्री योगेश्वराय नमः\nॐ श्री भगवते नमः\nॐ श्री भक्त वत्सलाय नमः\nॐ श्री सत्पुरुषाय नमः\nॐ श्री पुरुषोत्तमाय नमः\nॐ श्री सत्य तत्त्व बोधकाय नमः\nॐ श्री कामादिषड्वैरि ध्वंसिने नमः\nॐ श्री अभेदानन्दानुभव प्रदाय नमः", roman: "oṁ śrī brahmacarya tapaścaryādi suvratāya namaḥ\noṁ śrī satyadharma parāyaṇāya namaḥ\noṁ śrī siddheśvarāya namaḥ\noṁ śrī siddha saṅkalpāya namaḥ\noṁ śrī yogeśvarāya namaḥ\noṁ śrī bhagavate namaḥ\noṁ śrī bhakta vatsalāya namaḥ\noṁ śrī satpuruṣāya namaḥ\noṁ śrī puruṣottamāya namaḥ\noṁ śrī satya tattva bodhakāya namaḥ\noṁ śrī kāmādiṣaḍvairi dhvaṁsine namaḥ\noṁ śrī abhedānandānubhava pradāya namaḥ" },
      { label: "Names 97–108", script: "ॐ श्री सम सर्वमत सम्मताय नमः\nॐ श्री दक्षिणामूर्त्तये नमः\nॐ श्री वेङ्कटेश रमणाय नमः\nॐ श्री अद्भुतानन्दचर्याय नमः\nॐ श्री प्रपन्नार्तिहराय नमः\nॐ श्री संसारसर्वदुःखक्षयकराय नमः\nॐ श्री सर्ववित्सर्वतोमुखाय नमः\nॐ श्री सर्वान्तर्बहिःस्थिताय नमः\nॐ श्री सर्वमङ्गलकराय नमः\nॐ श्री सर्वाभीष्टप्रदाय नमः\nॐ श्री समरस सन्मार्गस्थापनाय नमः\nॐ श्री समर्थ सद्गुरु श्री साई नाथाय नमः", roman: "oṁ śrī sama sarvamata sammatāya namaḥ\noṁ śrī dakṣiṇāmūrttaye namaḥ\noṁ śrī veṅkaṭeśa ramaṇāya namaḥ\noṁ śrī adbhutānandacaryāya namaḥ\noṁ śrī prapannārtiharāya namaḥ\noṁ śrī saṁsārasarvaduḥkhakṣayakarāya namaḥ\noṁ śrī sarvavitsarvatomukhāya namaḥ\noṁ śrī sarvāntarbahiḥsthitāya namaḥ\noṁ śrī sarvamaṅgalakarāya namaḥ\noṁ śrī sarvābhīṣṭapradāya namaḥ\noṁ śrī samarasa sanmārgasthāpanāya namaḥ\noṁ śrī samartha sadguru śrī sāī nāthāya namaḥ" }
    ],
  },
  {
    title: "Sathya Sai Ashtottara Shatanamavali",
    tradition: "Ashtottara · 108 names",
    language: "Sanskrit",
    verses: [
      { label: "Names 1–12", script: "ॐ श्री भगवान् सत्य साई बाबाय नमः\nॐ श्री साई सत्य स्वरूपाय नमः\nॐ श्री साई सत्य धर्म परायणाय नमः\nॐ श्री साई वरदाय नमः\nॐ श्री साई सत्पुरुषाय नमः\nॐ श्री साई सत्यगुणात्मने नमः\nॐ श्री साई साधु वर्धनाय नमः\nॐ श्री साई साधु जन पोषनाय नमः\nॐ श्री साई सर्वज्ञाय नमः\nॐ श्री साई सर्व जन प्रियाय नमः\nॐ श्री साई सर्व शक्ति मूर्त्तये नमः\nॐ श्री साई सर्वेशाय नमः", roman: "oṁ śrī bhagavān satya sāī bābāya namaḥ\noṁ śrī sāī satya svarūpāya namaḥ\noṁ śrī sāī satya dharma parāyaṇāya namaḥ\noṁ śrī sāī varadāya namaḥ\noṁ śrī sāī satpuruṣāya namaḥ\noṁ śrī sāī satyaguṇātmane namaḥ\noṁ śrī sāī sādhu vardhanāya namaḥ\noṁ śrī sāī sādhu jana poṣanāya namaḥ\noṁ śrī sāī sarvajñāya namaḥ\noṁ śrī sāī sarva jana priyāya namaḥ\noṁ śrī sāī sarva śakti mūrttaye namaḥ\noṁ śrī sāī sarveśāya namaḥ" },
      { label: "Names 13–24", script: "ॐ श्री साई सर्व सङ्ग परित्यागिने नमः\nॐ श्री साई सर्वान्तर्यामिने नमः\nॐ श्री साई महिमात्मने नमः\nॐ श्री साई महेश्वर स्वरूपाय नमः\nॐ श्री साई पर्थि ग्रामोद्भवाय नमः\nॐ श्री साई पर्थि क्षेत्र निवासिने नमः\nॐ श्री साई यशकाय शिरिडी वासिने नमः\nॐ श्री साई जोडि आदि पल्लि सोमप्पाय नमः\nॐ श्री साई भारद्वाज ऋषि गोत्राय नमः\nॐ श्री साई भक्त वत्सलाय नमः\nॐ श्री साई अपान्तरात्मने नमः\nॐ श्री साई अवतार मूर्त्तये नमः", roman: "oṁ śrī sāī sarva saṅga parityāgine namaḥ\noṁ śrī sāī sarvāntaryāmine namaḥ\noṁ śrī sāī mahimātmane namaḥ\noṁ śrī sāī maheśvara svarūpāya namaḥ\noṁ śrī sāī parthi grāmodbhavāya namaḥ\noṁ śrī sāī parthi kṣetra nivāsine namaḥ\noṁ śrī sāī yaśakāya śiriḍī vāsine namaḥ\noṁ śrī sāī joḍi ādi palli somappāya namaḥ\noṁ śrī sāī bhāradvāja ṛṣi gotrāya namaḥ\noṁ śrī sāī bhakta vatsalāya namaḥ\noṁ śrī sāī apāntarātmane namaḥ\noṁ śrī sāī avatāra mūrttaye namaḥ" },
      { label: "Names 25–36", script: "ॐ श्री साई सर्वभय निवारिणे नमः\nॐ श्री साई आपस्तम्भ सूत्राय नमः\nॐ श्री साई अभय प्रदाय नमः\nॐ श्री साई रत्नाकर वंशोद्भवाय नमः\nॐ श्री साई शिरिडि अभेद शक्त्यावताराय नमः\nॐ श्री साई शंकराय नमः\nॐ श्री साई शिरिडि साई मूर्त्तये नमः\nॐ श्री साई द्वारकामाई वासिने नमः\nॐ श्री साई चित्रावति तट पुट्टपर्थि विहारिणे नमः\nॐ श्री साई शक्ति प्रदाय नमः\nॐ श्री साई शरणागत त्राणाय नमः\nॐ श्री साई आनन्दाय नमः", roman: "oṁ śrī sāī sarvabhaya nivāriṇe namaḥ\noṁ śrī sāī āpastambha sūtrāya namaḥ\noṁ śrī sāī abhaya pradāya namaḥ\noṁ śrī sāī ratnākara vaṁśodbhavāya namaḥ\noṁ śrī sāī śiriḍi abheda śaktyāvatārāya namaḥ\noṁ śrī sāī śaṁkarāya namaḥ\noṁ śrī sāī śiriḍi sāī mūrttaye namaḥ\noṁ śrī sāī dvārakāmāī vāsine namaḥ\noṁ śrī sāī citrāvati taṭa puṭṭaparthi vihāriṇe namaḥ\noṁ śrī sāī śakti pradāya namaḥ\noṁ śrī sāī śaraṇāgata trāṇāya namaḥ\noṁ śrī sāī ānandāya namaḥ" },
      { label: "Names 37–48", script: "ॐ श्री साई आनन्द दाय नमः\nॐ श्री साई आर्थ त्राण परायणाय नमः\nॐ श्री साई अनाथ नाथाय नमः\nॐ श्री साई असहाय सहायाय नमः\nॐ श्री साई लोक बान्धवाय नमः\nॐ श्री साई लोक रक्षा परायणाय नमः\nॐ श्री साई लोक नाथाय नमः\nॐ श्री साई दीन जन पोषणाय नमः\nॐ श्री साई मूर्त्ति त्रय स्वरूपाय नमः\nॐ श्री साई मुक्ति प्रदाय नमः\nॐ श्री साई कलुष विदूराय नमः\nॐ श्री साई करुणाकराय नमः", roman: "oṁ śrī sāī ānanda dāya namaḥ\noṁ śrī sāī ārtha trāṇa parāyaṇāya namaḥ\noṁ śrī sāī anātha nāthāya namaḥ\noṁ śrī sāī asahāya sahāyāya namaḥ\noṁ śrī sāī loka bāndhavāya namaḥ\noṁ śrī sāī loka rakṣā parāyaṇāya namaḥ\noṁ śrī sāī loka nāthāya namaḥ\noṁ śrī sāī dīna jana poṣaṇāya namaḥ\noṁ śrī sāī mūrtti traya svarūpāya namaḥ\noṁ śrī sāī mukti pradāya namaḥ\noṁ śrī sāī kaluṣa vidūrāya namaḥ\noṁ śrī sāī karuṇākarāya namaḥ" },
      { label: "Names 49–60", script: "ॐ श्री साई सर्वाधाराय नमः\nॐ श्री साई सर्व हृद्वासिने नमः\nॐ श्री साई सर्व पुण्य फल प्रदाय नमः\nॐ श्री साई सर्व पाप क्षय कराय नमः\nॐ श्री साई सर्व रोग निवारिणे नमः\nॐ श्री साई सर्व बाध हराय नमः\nॐ श्री साई अनन्त नुत कर्तृणे नमः\nॐ श्री साई आदि पुरुषाय नमः\nॐ श्री साई आदि शक्तये नमः\nॐ श्री साई अपरूप शक्तिने नमः\nॐ श्री साई अव्यक्त रूपिणे नमः\nॐ श्री साई काम क्रोध ध्वंसिने नमः", roman: "oṁ śrī sāī sarvādhārāya namaḥ\noṁ śrī sāī sarva hṛdvāsine namaḥ\noṁ śrī sāī sarva puṇya phala pradāya namaḥ\noṁ śrī sāī sarva pāpa kṣaya karāya namaḥ\noṁ śrī sāī sarva roga nivāriṇe namaḥ\noṁ śrī sāī sarva bādha harāya namaḥ\noṁ śrī sāī ananta nuta kartṛṇe namaḥ\noṁ śrī sāī ādi puruṣāya namaḥ\noṁ śrī sāī ādi śaktaye namaḥ\noṁ śrī sāī aparūpa śaktine namaḥ\noṁ śrī sāī avyakta rūpiṇe namaḥ\noṁ śrī sāī kāma krodha dhvaṁsine namaḥ" },
      { label: "Names 61–72", script: "ॐ श्री साई कनकाम्बर धारिणे नमः\nॐ श्री साई अद्भुत चर्याय नमः\nॐ श्री साई आपद् बान्धवाय नमः\nॐ श्री साई प्रेमात्मने नमः\nॐ श्री साई प्रेम मूर्त्तये नमः\nॐ श्री साई प्रेम प्रदाय नमः\nॐ श्री साई प्रियाय नमः\nॐ श्री साई भक्त प्रियाय नमः\nॐ श्री साई भक्त मन्दाराय नमः\nॐ श्री साई भक्त जन हृदय विहाराय नमः\nॐ श्री साई भक्त जन हृदयालयाय नमः\nॐ श्री साई भक्त पराधीनाय नमः", roman: "oṁ śrī sāī kanakāmbara dhāriṇe namaḥ\noṁ śrī sāī adbhuta caryāya namaḥ\noṁ śrī sāī āpad bāndhavāya namaḥ\noṁ śrī sāī premātmane namaḥ\noṁ śrī sāī prema mūrttaye namaḥ\noṁ śrī sāī prema pradāya namaḥ\noṁ śrī sāī priyāya namaḥ\noṁ śrī sāī bhakta priyāya namaḥ\noṁ śrī sāī bhakta mandārāya namaḥ\noṁ śrī sāī bhakta jana hṛdaya vihārāya namaḥ\noṁ śrī sāī bhakta jana hṛdayālayāya namaḥ\noṁ śrī sāī bhakta parādhīnāya namaḥ" },
      { label: "Names 73–84", script: "ॐ श्री साई भक्ति ज्ञान प्रदीपाय नमः\nॐ श्री साई भक्ति ज्ञान प्रदाय नमः\nॐ श्री साई सुज्ञान मार्ग दर्शकाय नमः\nॐ श्री साई ज्ञान स्वरूपाय नमः\nॐ श्री साई गीता बोधकाय नमः\nॐ श्री साई ज्ञान सिद्धिदाय नमः\nॐ श्री साई सुन्दर रूपाय नमः\nॐ श्री साई पुण्य पुरुषाय नमः\nॐ श्री साई फल प्रदाय नमः\nॐ श्री साई पुरुषोत्तमाय नमः\nॐ श्री साई पुराण पुरुषाय नमः\nॐ श्री साई अतीताय नमः", roman: "oṁ śrī sāī bhakti jñāna pradīpāya namaḥ\noṁ śrī sāī bhakti jñāna pradāya namaḥ\noṁ śrī sāī sujñāna mārga darśakāya namaḥ\noṁ śrī sāī jñāna svarūpāya namaḥ\noṁ śrī sāī gītā bodhakāya namaḥ\noṁ śrī sāī jñāna siddhidāya namaḥ\noṁ śrī sāī sundara rūpāya namaḥ\noṁ śrī sāī puṇya puruṣāya namaḥ\noṁ śrī sāī phala pradāya namaḥ\noṁ śrī sāī puruṣottamāya namaḥ\noṁ śrī sāī purāṇa puruṣāya namaḥ\noṁ śrī sāī atītāya namaḥ" },
      { label: "Names 85–96", script: "ॐ श्री साई कालातीताय नमः\nॐ श्री साई सिद्धि रूपाय नमः\nॐ श्री साई सिद्ध सङ्कल्पाय नमः\nॐ श्री साई आरोग्य प्रदाय नमः\nॐ श्री साई अन्नवस्त्रदाय नमः\nॐ श्री साई संसार दुःखक्षयकराय नमः\nॐ श्री साई सर्वाभीष्ट प्रदाय नमः\nॐ श्री साई कल्यान गुणाय नमः\nॐ श्री साई कर्म ध्वंसिने नमः\nॐ श्री साई साधु मानस शोभिताय नमः\nॐ श्री साई सर्वमत सम्मताय नमः\nॐ श्री साई साधुमानस परिशुद्धकाय नमः", roman: "oṁ śrī sāī kālātītāya namaḥ\noṁ śrī sāī siddhi rūpāya namaḥ\noṁ śrī sāī siddha saṅkalpāya namaḥ\noṁ śrī sāī ārogya pradāya namaḥ\noṁ śrī sāī annavastradāya namaḥ\noṁ śrī sāī saṁsāra duḥkhakṣayakarāya namaḥ\noṁ śrī sāī sarvābhīṣṭa pradāya namaḥ\noṁ śrī sāī kalyāna guṇāya namaḥ\noṁ śrī sāī karma dhvaṁsine namaḥ\noṁ śrī sāī sādhu mānasa śobhitāya namaḥ\noṁ śrī sāī sarvamata sammatāya namaḥ\noṁ śrī sāī sādhumānasa pariśuddhakāya namaḥ" },
      { label: "Names 97–108", script: "ॐ श्री साई साधकानुग्रह वटवृक्ष प्रतिष्ठापकाय नमः\nॐ श्री साई सकल संशय हराय नमः\nॐ श्री साई सकल तत्त्व बोधकाय नमः\nॐ श्री साई योगीश्वराय नमः\nॐ श्री साई योगीन्द्र वन्दिताय नमः\nॐ श्री साई सर्व मङ्गलकराय नमः\nॐ श्री साई सर्वसिद्धि प्रदाय नमः\nॐ श्री साई आपन्निवारिणे नमः\nॐ श्री साई आर्तिहराय नमः\nॐ श्री साई शान्त मूर्त्तये नमः\nॐ श्री साई सुलभ प्रसन्नाय नमः\nॐ श्री साई भगवान् श्री सत्य साई बाबाय नमः", roman: "oṁ śrī sāī sādhakānugraha vaṭavṛkṣa pratiṣṭhāpakāya namaḥ\noṁ śrī sāī sakala saṁśaya harāya namaḥ\noṁ śrī sāī sakala tattva bodhakāya namaḥ\noṁ śrī sāī yogīśvarāya namaḥ\noṁ śrī sāī yogīndra vanditāya namaḥ\noṁ śrī sāī sarva maṅgalakarāya namaḥ\noṁ śrī sāī sarvasiddhi pradāya namaḥ\noṁ śrī sāī āpannivāriṇe namaḥ\noṁ śrī sāī ārtiharāya namaḥ\noṁ śrī sāī śānta mūrttaye namaḥ\noṁ śrī sāī sulabha prasannāya namaḥ\noṁ śrī sāī bhagavān śrī satya sāī bābāya namaḥ" }
    ],
  }
];

async function main() {
  for (const chant of CHANTS) {
    const existing = await prisma.song.findFirst({
      where: { title: { equals: chant.title, mode: "insensitive" } },
      include: { verses: { orderBy: { order: "asc" } } },
    });

    if (!existing) {
      await prisma.song.create({
        data: {
          title: chant.title,
          kind: "chant",
          language: chant.language,
          tradition: chant.tradition,
          createdBy: "seedChants",
          verses: {
            create: chant.verses.map((v, i) => ({
              order: i,
              label: v.label,
              script: v.script,
              roman: v.roman,
            })),
          },
        },
      });
      console.log(`added   ${chant.title} — ${chant.verses.length} verses`);
      continue;
    }

    const same =
      existing.verses.length === chant.verses.length &&
      existing.verses.every(
        (v, i) => v.script === chant.verses[i].script && v.roman === chant.verses[i].roman,
      );

    if (same) {
      if (existing.kind !== "chant") {
        await prisma.song.update({ where: { id: existing.id }, data: { kind: "chant" } });
        console.log(`fixed   ${chant.title} — marked as a chant`);
      } else {
        console.log(`ok      ${chant.title} — already as seeded`);
      }
      continue;
    }

    if (!force) {
      console.log(`skip    ${chant.title} — edited since it was seeded (--force to rewrite)`);
      continue;
    }

    /*
     * Replace the words wholesale rather than patch them. The verses are a
     * numbered sequence and a corrected source may not divide the same way, so
     * pairing the old with the new would be inventing a correspondence that is
     * not there.
     */
    await prisma.$transaction([
      prisma.songVerse.deleteMany({ where: { songId: existing.id } }),
      prisma.song.update({
        where: { id: existing.id },
        data: {
          kind: "chant",
          language: chant.language,
          tradition: chant.tradition,
          verses: {
            create: chant.verses.map((v, i) => ({
              order: i,
              label: v.label,
              script: v.script,
              roman: v.roman,
            })),
          },
        },
      }),
    ]);
    console.log(`rewrote ${chant.title} — ${chant.verses.length} verses`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
