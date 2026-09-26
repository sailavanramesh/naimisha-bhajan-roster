import { prisma } from "@/lib/db";

/**
 * scripts/seedChants.ts — the two ashtottaras, in Devanagari and IAST.
 *
 *     npx tsx scripts/seedChants.ts
 *
 * IDEMPOTENT, and deliberately CAUTIOUS about it: a chant that already exists
 * and has had a verse edited is left completely alone. These are devotional
 * texts the group will correct by hand — somebody who fixes a name in the
 * editor must not have it overwritten the next time this is run. Only a chant
 * that is missing, or one whose words are still exactly as seeded, is written.
 *
 * WHERE THE WORDS CAME FROM, because somebody will want to check them:
 *   - Shirdi: the IAST of stotranidhi.com, normalised from its ō/ē convention
 *     to standard IAST.
 *   - Sathya Sai: the roman list published by sathyasai.org's Sai Rhythms and
 *     by the Sri Sathya Sai Centre Kenya, which agree name for name, rendered
 *     into IAST.
 *   - The Devanagari in both is a strict Sanskrit transliteration OF THAT IAST,
 *     not a separate source. lib/toDevanagari.ts was not used: it guesses at
 *     Hindi schwa deletion, which Sanskrit does not have.
 *
 * So the Devanagari is only ever as right as the IAST it came from. Both want
 * a reading by somebody who knows the texts, and the verse editor on the page
 * is where that correction goes.
 *
 * Twelve names a verse, nine verses: an ashtottara is recited in stretches and
 * a 108-line wall is no use to anybody following along.
 */

const CHANTS = [
  {
    title: "Shirdi Sai Ashtottara Shatanamavali",
    tradition: "Ashtottara · 108 names",
    language: "Sanskrit",
    verses: [
      { label: "Names 1–12", script: "ॐ श्रीसायिनाथाय नमः\nॐ लक्ष्मीनारायणाय नमः\nॐ कृष्णरामशिवमारुत्यादिरूपाय नमः\nॐ शेषशायिने नमः\nॐ गोदावरीतटशिरडीवासिने नमः\nॐ भक्तहृदयालयाय नमः\nॐ सर्वहृद्वासिने नमः\nॐ भूतावासाय नमः\nॐ भूतभविष्यद्भाववर्जिताय नमः\nॐ कालातीताय नमः\nॐ कालाय नमः\nॐ कालकालाय नमः", roman: "oṁ śrīsāyināthāya namaḥ\noṁ lakṣmīnārāyaṇāya namaḥ\noṁ kṛṣṇarāmaśivamārutyādirūpāya namaḥ\noṁ śeṣaśāyine namaḥ\noṁ godāvarītaṭaśiraḍīvāsine namaḥ\noṁ bhaktahṛdayālayāya namaḥ\noṁ sarvahṛdvāsine namaḥ\noṁ bhūtāvāsāya namaḥ\noṁ bhūtabhaviṣyadbhāvavarjitāya namaḥ\noṁ kālātītāya namaḥ\noṁ kālāya namaḥ\noṁ kālakālāya namaḥ" },
      { label: "Names 13–24", script: "ॐ कालदर्पदमनाय नमः\nॐ मृत्युञ्जयाय नमः\nॐ अमर्त्याय नमः\nॐ मर्त्याभयप्रदाय नमः\nॐ जीवाधाराय नमः\nॐ सर्वाधाराय नमः\nॐ भक्तावनसमर्थाय नमः\nॐ भक्तावनप्रतिज्ञाय नमः\nॐ अन्नवस्त्रदाय नमः\nॐ आरोग्यक्षेमदाय नमः\nॐ धनमाङ्गल्यदाय नमः\nॐ बुद्धीसिद्धीदाय नमः", roman: "oṁ kāladarpadamanāya namaḥ\noṁ mṛtyuñjayāya namaḥ\noṁ amartyāya namaḥ\noṁ martyābhayapradāya namaḥ\noṁ jīvādhārāya namaḥ\noṁ sarvādhārāya namaḥ\noṁ bhaktāvanasamarthāya namaḥ\noṁ bhaktāvanapratijñāya namaḥ\noṁ annavastradāya namaḥ\noṁ ārogyakṣemadāya namaḥ\noṁ dhanamāṅgalyadāya namaḥ\noṁ buddhīsiddhīdāya namaḥ" },
      { label: "Names 25–36", script: "ॐ पुत्रमित्रकलत्रबन्धुदाय नमः\nॐ योगक्षेमवहाय नमः\nॐ आपद्बान्धवाय नमः\nॐ मार्गबन्धवे नमः\nॐ भुक्तिमुक्तिस्वर्गापवर्गदाय नमः\nॐ प्रियाय नमः\nॐ प्रीतिवर्धनाय नमः\nॐ अन्तर्यामिने नमः\nॐ सच्चिदात्मने नमः\nॐ नित्यानन्दाय नमः\nॐ परमसुखदाय नमः\nॐ परमेश्वराय नमः", roman: "oṁ putramitrakalatrabandhudāya namaḥ\noṁ yogakṣemavahāya namaḥ\noṁ āpadbāndhavāya namaḥ\noṁ mārgabandhave namaḥ\noṁ bhuktimuktisvargāpavargadāya namaḥ\noṁ priyāya namaḥ\noṁ prītivardhanāya namaḥ\noṁ antaryāmine namaḥ\noṁ saccidātmane namaḥ\noṁ nityānandāya namaḥ\noṁ paramasukhadāya namaḥ\noṁ parameśvarāya namaḥ" },
      { label: "Names 37–48", script: "ॐ परब्रह्मणे नमः\nॐ परमात्मने नमः\nॐ ज्ञानस्वरूपिणे नमः\nॐ जगतः पित्रे नमः\nॐ भक्तानां मातृदातृपितामहाय नमः\nॐ भक्ताभयप्रदाय नमः\nॐ भक्तपराधीनाय नमः\nॐ भक्तानुग्रहकातराय नमः\nॐ शरणागतवत्सलाय नमः\nॐ भक्तिशक्तिप्रदाय नमः\nॐ ज्ञानवैराग्यदाय नमः\nॐ प्रेमप्रदाय नमः", roman: "oṁ parabrahmaṇe namaḥ\noṁ paramātmane namaḥ\noṁ jñānasvarūpiṇe namaḥ\noṁ jagataḥ pitre namaḥ\noṁ bhaktānāṁ mātṛdātṛpitāmahāya namaḥ\noṁ bhaktābhayapradāya namaḥ\noṁ bhaktaparādhīnāya namaḥ\noṁ bhaktānugrahakātarāya namaḥ\noṁ śaraṇāgatavatsalāya namaḥ\noṁ bhaktiśaktipradāya namaḥ\noṁ jñānavairāgyadāya namaḥ\noṁ premapradāya namaḥ" },
      { label: "Names 49–60", script: "ॐ संशयहृदयदौर्बल्य पापकर्मवासनाक्षयकराय नमः\nॐ हृदयग्रन्थिभेदकाय नमः\nॐ कर्मध्वंसिने नमः\nॐ शुद्धसत्त्वस्थिताय नमः\nॐ गुणातीत गुणात्मने नमः\nॐ अनन्तकल्याणगुणाय नमः\nॐ अमितपराक्रमाय नमः\nॐ जयिने नमः\nॐ दुर्धर्षाक्षोभ्याय नमः\nॐ अपराजिताय नमः\nॐ त्रिलोकेषु अविघातगतये नमः\nॐ अशक्यरहिताय नमः", roman: "oṁ saṁśayahṛdayadaurbalya pāpakarmavāsanākṣayakarāya namaḥ\noṁ hṛdayagranthibhedakāya namaḥ\noṁ karmadhvaṁsine namaḥ\noṁ śuddhasattvasthitāya namaḥ\noṁ guṇātīta guṇātmane namaḥ\noṁ anantakalyāṇaguṇāya namaḥ\noṁ amitaparākramāya namaḥ\noṁ jayine namaḥ\noṁ durdharṣākṣobhyāya namaḥ\noṁ aparājitāya namaḥ\noṁ trilokeṣu avighātagataye namaḥ\noṁ aśakyarahitāya namaḥ" },
      { label: "Names 61–72", script: "ॐ सर्वशक्तिमूर्तये नमः\nॐ स्वरूपसुन्दराय नमः\nॐ सुलोचनाय नमः\nॐ बहुरूपविश्वमूर्तये नमः\nॐ अरूपव्यक्ताय नमः\nॐ अचिन्त्याय नमः\nॐ सूक्ष्माय नमः\nॐ सर्वान्तर्यामिणे नमः\nॐ मनोवागतीताय नमः\nॐ प्रेममूर्तये नमः\nॐ सुलभदुर्लभाय नमः\nॐ असहायसहायाय नमः", roman: "oṁ sarvaśaktimūrtaye namaḥ\noṁ svarūpasundarāya namaḥ\noṁ sulocanāya namaḥ\noṁ bahurūpaviśvamūrtaye namaḥ\noṁ arūpavyaktāya namaḥ\noṁ acintyāya namaḥ\noṁ sūkṣmāya namaḥ\noṁ sarvāntaryāmiṇe namaḥ\noṁ manovāgatītāya namaḥ\noṁ premamūrtaye namaḥ\noṁ sulabhadurlabhāya namaḥ\noṁ asahāyasahāyāya namaḥ" },
      { label: "Names 73–84", script: "ॐ अनाथनाथदीनबन्धवे नमः\nॐ सर्वभारभृते नमः\nॐ अकर्मानेककर्मासुकर्मिणे नमः\nॐ पुण्यश्रवणकीर्तनाय नमः\nॐ तीर्थाय नमः\nॐ वासुदेवाय नमः\nॐ सताङ्गतये नमः\nॐ सत्परायणाय नमः\nॐ लोकनाथाय नमः\nॐ पावनानघाय नमः\nॐ अमृतांशुवे नमः\nॐ भास्करप्रभाय नमः", roman: "oṁ anāthanāthadīnabandhave namaḥ\noṁ sarvabhārabhṛte namaḥ\noṁ akarmānekakarmāsukarmiṇe namaḥ\noṁ puṇyaśravaṇakīrtanāya namaḥ\noṁ tīrthāya namaḥ\noṁ vāsudevāya namaḥ\noṁ satāṅgataye namaḥ\noṁ satparāyaṇāya namaḥ\noṁ lokanāthāya namaḥ\noṁ pāvanānaghāya namaḥ\noṁ amṛtāṁśuve namaḥ\noṁ bhāskaraprabhāya namaḥ" },
      { label: "Names 85–96", script: "ॐ ब्रह्मचर्यतपश्चर्यादि सुव्रताय नमः\nॐ सत्यधर्मपरायणाय नमः\nॐ सिद्धेश्वराय नमः\nॐ सिद्धसङ्कल्पाय नमः\nॐ योगेश्वराय नमः\nॐ भगवते नमः\nॐ भक्तवत्सलाय नमः\nॐ सत्पुरुषाय नमः\nॐ पुरुषोत्तमाय नमः\nॐ सत्यतत्त्वबोधकाय नमः\nॐ कामादिषड्वैरिध्वंसिने नमः\nॐ अभेदानन्दानुभवप्रदाय नमः", roman: "oṁ brahmacaryatapaścaryādi suvratāya namaḥ\noṁ satyadharmaparāyaṇāya namaḥ\noṁ siddheśvarāya namaḥ\noṁ siddhasaṅkalpāya namaḥ\noṁ yogeśvarāya namaḥ\noṁ bhagavate namaḥ\noṁ bhaktavatsalāya namaḥ\noṁ satpuruṣāya namaḥ\noṁ puruṣottamāya namaḥ\noṁ satyatattvabodhakāya namaḥ\noṁ kāmādiṣaḍvairidhvaṁsine namaḥ\noṁ abhedānandānubhavapradāya namaḥ" },
      { label: "Names 97–108", script: "ॐ सर्वमतसम्मताय नमः\nॐ श्रीदक्षिणामूर्तये नमः\nॐ श्रीवेङ्कटेशरमणाय नमः\nॐ अद्भुतानन्दचर्याय नमः\nॐ प्रपन्नार्तिहराय नमः\nॐ संसारसर्वदुःखक्षयकराय नमः\nॐ सर्ववित्सर्वतोमुखाय नमः\nॐ सर्वान्तर्बहिःस्थिताय नमः\nॐ सर्वमङ्गलकराय नमः\nॐ सर्वाभीष्टप्रदाय नमः\nॐ समरसन्मार्गस्थापनाय नमः\nॐ श्रीसमर्थसद्गुरुसायिनाथाय नमः", roman: "oṁ sarvamatasammatāya namaḥ\noṁ śrīdakṣiṇāmūrtaye namaḥ\noṁ śrīveṅkaṭeśaramaṇāya namaḥ\noṁ adbhutānandacaryāya namaḥ\noṁ prapannārtiharāya namaḥ\noṁ saṁsārasarvaduḥkhakṣayakarāya namaḥ\noṁ sarvavitsarvatomukhāya namaḥ\noṁ sarvāntarbahiḥsthitāya namaḥ\noṁ sarvamaṅgalakarāya namaḥ\noṁ sarvābhīṣṭapradāya namaḥ\noṁ samarasanmārgasthāpanāya namaḥ\noṁ śrīsamarthasadgurusāyināthāya namaḥ" }
    ],
  },
  {
    title: "Sathya Sai Ashtottara Shatanamavali",
    tradition: "Ashtottara · 108 names",
    language: "Sanskrit",
    verses: [
      { label: "Names 1–12", script: "ॐ श्री भगवान् श्री सत्य साई बाबाय नमः\nॐ श्री साई सत्य स्वरूपाय नमः\nॐ श्री साई सत्य धर्म परायणाय नमः\nॐ श्री साई वरदाय नमः\nॐ श्री साई सत्पुरुषाय नमः\nॐ श्री साई सत्य गुणात्मने नमः\nॐ श्री साई साधु वर्धनाय नमः\nॐ श्री साई साधु जन पोषणाय नमः\nॐ श्री साई सर्वज्ञाय नमः\nॐ श्री साई सर्व जन प्रियाय नमः\nॐ श्री साई सर्व शक्ति मूर्तये नमः\nॐ श्री साई सर्वेशाय नमः", roman: "oṁ śrī bhagavān śrī satya sāī bābāya namaḥ\noṁ śrī sāī satya svarūpāya namaḥ\noṁ śrī sāī satya dharma parāyaṇāya namaḥ\noṁ śrī sāī varadāya namaḥ\noṁ śrī sāī satpuruṣāya namaḥ\noṁ śrī sāī satya guṇātmane namaḥ\noṁ śrī sāī sādhu vardhanāya namaḥ\noṁ śrī sāī sādhu jana poṣaṇāya namaḥ\noṁ śrī sāī sarvajñāya namaḥ\noṁ śrī sāī sarva jana priyāya namaḥ\noṁ śrī sāī sarva śakti mūrtaye namaḥ\noṁ śrī sāī sarveśāya namaḥ" },
      { label: "Names 13–24", script: "ॐ श्री साई सर्व सङ्ग परित्यागिने नमः\nॐ श्री साई सर्वान्तर्यामिने नमः\nॐ श्री साई महिमात्मने नमः\nॐ श्री साई महेश्वर स्वरूपाय नमः\nॐ श्री साई पर्थि ग्रामोद्भवाय नमः\nॐ श्री साई पर्थि क्षेत्र निवासिने नमः\nॐ श्री साई यशःकाय शिरडी वासिने नमः\nॐ श्री साई जोडि आदिपल्लि सोमप्पाय नमः\nॐ श्री साई भारद्वाज ऋषि गोत्राय नमः\nॐ श्री साई भक्त वत्सलाय नमः\nॐ श्री साई अपान्तरात्मने नमः\nॐ श्री साई अवतार मूर्तये नमः", roman: "oṁ śrī sāī sarva saṅga parityāgine namaḥ\noṁ śrī sāī sarvāntaryāmine namaḥ\noṁ śrī sāī mahimātmane namaḥ\noṁ śrī sāī maheśvara svarūpāya namaḥ\noṁ śrī sāī parthi grāmodbhavāya namaḥ\noṁ śrī sāī parthi kṣetra nivāsine namaḥ\noṁ śrī sāī yaśaḥkāya śiraḍī vāsine namaḥ\noṁ śrī sāī joḍi ādipalli somappāya namaḥ\noṁ śrī sāī bhāradvāja ṛṣi gotrāya namaḥ\noṁ śrī sāī bhakta vatsalāya namaḥ\noṁ śrī sāī apāntarātmane namaḥ\noṁ śrī sāī avatāra mūrtaye namaḥ" },
      { label: "Names 25–36", script: "ॐ श्री साई सर्व भय निवारिणे नमः\nॐ श्री साई आपस्तम्ब सूत्राय नमः\nॐ श्री साई अभय प्रदाय नमः\nॐ श्री साई रत्नाकर वंशोद्भवाय नमः\nॐ श्री साई शिरडी साई अभेद शक्त्यवताराय नमः\nॐ श्री साई शङ्कराय नमः\nॐ श्री साई शिरडी साई मूर्तये नमः\nॐ श्री साई द्वारकामयी वासिने नमः\nॐ श्री साई चित्रावती तट पुट्टपर्थि विहारिणे नमः\nॐ श्री साई शक्ति प्रदाय नमः\nॐ श्री साई शरणागत त्राणाय नमः\nॐ श्री साई आनन्दाय नमः", roman: "oṁ śrī sāī sarva bhaya nivāriṇe namaḥ\noṁ śrī sāī āpastamba sūtrāya namaḥ\noṁ śrī sāī abhaya pradāya namaḥ\noṁ śrī sāī ratnākara vaṁśodbhavāya namaḥ\noṁ śrī sāī śiraḍī sāī abheda śaktyavatārāya namaḥ\noṁ śrī sāī śaṅkarāya namaḥ\noṁ śrī sāī śiraḍī sāī mūrtaye namaḥ\noṁ śrī sāī dvārakāmayī vāsine namaḥ\noṁ śrī sāī citrāvatī taṭa puṭṭaparthi vihāriṇe namaḥ\noṁ śrī sāī śakti pradāya namaḥ\noṁ śrī sāī śaraṇāgata trāṇāya namaḥ\noṁ śrī sāī ānandāya namaḥ" },
      { label: "Names 37–48", script: "ॐ श्री साई आनन्द दाय नमः\nॐ श्री साई आर्त त्राण परायणाय नमः\nॐ श्री साई अनाथ नाथाय नमः\nॐ श्री साई असहाय सहायाय नमः\nॐ श्री साई लोक बान्धवाय नमः\nॐ श्री साई लोक रक्षा परायणाय नमः\nॐ श्री साई लोक नाथाय नमः\nॐ श्री साई दीनजन पोषणाय नमः\nॐ श्री साई मूर्ति त्रय स्वरूपाय नमः\nॐ श्री साई मुक्ति प्रदाय नमः\nॐ श्री साई कलुष विदूराय नमः\nॐ श्री साई करुणा कराय नमः", roman: "oṁ śrī sāī ānanda dāya namaḥ\noṁ śrī sāī ārta trāṇa parāyaṇāya namaḥ\noṁ śrī sāī anātha nāthāya namaḥ\noṁ śrī sāī asahāya sahāyāya namaḥ\noṁ śrī sāī loka bāndhavāya namaḥ\noṁ śrī sāī loka rakṣā parāyaṇāya namaḥ\noṁ śrī sāī loka nāthāya namaḥ\noṁ śrī sāī dīnajana poṣaṇāya namaḥ\noṁ śrī sāī mūrti traya svarūpāya namaḥ\noṁ śrī sāī mukti pradāya namaḥ\noṁ śrī sāī kaluṣa vidūrāya namaḥ\noṁ śrī sāī karuṇā karāya namaḥ" },
      { label: "Names 49–60", script: "ॐ श्री साई सर्वाधाराय नमः\nॐ श्री साई सर्व हृद् वासिने नमः\nॐ श्री साई पुण्य फल प्रदाय नमः\nॐ श्री साई सर्व पाप क्षय कराय नमः\nॐ श्री साई सर्व रोग निवारिणे नमः\nॐ श्री साई सर्व बाधा हराय नमः\nॐ श्री साई अनन्तनुत कर्त्रे नमः\nॐ श्री साई आदि पुरुषाय नमः\nॐ श्री साई आदि शक्तये नमः\nॐ श्री साई अपरूप शक्तिने नमः\nॐ श्री साई अव्यक्त रूपिणे नमः\nॐ श्री साई काम क्रोध ध्वंसिने नमः", roman: "oṁ śrī sāī sarvādhārāya namaḥ\noṁ śrī sāī sarva hṛd vāsine namaḥ\noṁ śrī sāī puṇya phala pradāya namaḥ\noṁ śrī sāī sarva pāpa kṣaya karāya namaḥ\noṁ śrī sāī sarva roga nivāriṇe namaḥ\noṁ śrī sāī sarva bādhā harāya namaḥ\noṁ śrī sāī anantanuta kartre namaḥ\noṁ śrī sāī ādi puruṣāya namaḥ\noṁ śrī sāī ādi śaktaye namaḥ\noṁ śrī sāī aparūpa śaktine namaḥ\noṁ śrī sāī avyakta rūpiṇe namaḥ\noṁ śrī sāī kāma krodha dhvaṁsine namaḥ" },
      { label: "Names 61–72", script: "ॐ श्री साई कनकाम्बर धारिणे नमः\nॐ श्री साई अद्भुत चर्याय नमः\nॐ श्री साई आपद् बान्धवाय नमः\nॐ श्री साई प्रेमात्मने नमः\nॐ श्री साई प्रेम मूर्तये नमः\nॐ श्री साई प्रेम प्रदाय नमः\nॐ श्री साई प्रियाय नमः\nॐ श्री साई भक्त प्रियाय नमः\nॐ श्री साई भक्त मन्दाराय नमः\nॐ श्री साई भक्त जन हृदय विहाराय नमः\nॐ श्री साई भक्त जन हृदयालयाय नमः\nॐ श्री साई भक्त पराधीनाय नमः", roman: "oṁ śrī sāī kanakāmbara dhāriṇe namaḥ\noṁ śrī sāī adbhuta caryāya namaḥ\noṁ śrī sāī āpad bāndhavāya namaḥ\noṁ śrī sāī premātmane namaḥ\noṁ śrī sāī prema mūrtaye namaḥ\noṁ śrī sāī prema pradāya namaḥ\noṁ śrī sāī priyāya namaḥ\noṁ śrī sāī bhakta priyāya namaḥ\noṁ śrī sāī bhakta mandārāya namaḥ\noṁ śrī sāī bhakta jana hṛdaya vihārāya namaḥ\noṁ śrī sāī bhakta jana hṛdayālayāya namaḥ\noṁ śrī sāī bhakta parādhīnāya namaḥ" },
      { label: "Names 73–84", script: "ॐ श्री साई भक्ति ज्ञान प्रदीपाय नमः\nॐ श्री साई भक्ति प्रदाय नमः\nॐ श्री साई सुज्ञान मार्ग दर्शकाय नमः\nॐ श्री साई ज्ञान स्वरूपाय नमः\nॐ श्री साई गीता बोधकाय नमः\nॐ श्री साई ज्ञान सिद्धि दाय नमः\nॐ श्री साई सुन्दर रूपाय नमः\nॐ श्री साई पुण्य पुरुषाय नमः\nॐ श्री साई फल प्रदाय नमः\nॐ श्री साई पुरुषोत्तमाय नमः\nॐ श्री साई पुराण पुरुषाय नमः\nॐ श्री साई अतीताय नमः", roman: "oṁ śrī sāī bhakti jñāna pradīpāya namaḥ\noṁ śrī sāī bhakti pradāya namaḥ\noṁ śrī sāī sujñāna mārga darśakāya namaḥ\noṁ śrī sāī jñāna svarūpāya namaḥ\noṁ śrī sāī gītā bodhakāya namaḥ\noṁ śrī sāī jñāna siddhi dāya namaḥ\noṁ śrī sāī sundara rūpāya namaḥ\noṁ śrī sāī puṇya puruṣāya namaḥ\noṁ śrī sāī phala pradāya namaḥ\noṁ śrī sāī puruṣottamāya namaḥ\noṁ śrī sāī purāṇa puruṣāya namaḥ\noṁ śrī sāī atītāya namaḥ" },
      { label: "Names 85–96", script: "ॐ श्री साई कालातीताय नमः\nॐ श्री साई सिद्धि रूपाय नमः\nॐ श्री साई सिद्ध सङ्कल्पाय नमः\nॐ श्री साई आरोग्य प्रदाय नमः\nॐ श्री साई अन्न वस्त्र दाय नमः\nॐ श्री साई संसार दुःख क्षय कराय नमः\nॐ श्री साई सर्वाभीष्ट प्रदाय नमः\nॐ श्री साई कल्याण गुणाय नमः\nॐ श्री साई कर्म ध्वंसिने नमः\nॐ श्री साई साधु मानस शोभिताय नमः\nॐ श्री साई सर्व मत सम्मताय नमः\nॐ श्री साई साधु मानस परिशोधकाय नमः", roman: "oṁ śrī sāī kālātītāya namaḥ\noṁ śrī sāī siddhi rūpāya namaḥ\noṁ śrī sāī siddha saṅkalpāya namaḥ\noṁ śrī sāī ārogya pradāya namaḥ\noṁ śrī sāī anna vastra dāya namaḥ\noṁ śrī sāī saṁsāra duḥkha kṣaya karāya namaḥ\noṁ śrī sāī sarvābhīṣṭa pradāya namaḥ\noṁ śrī sāī kalyāṇa guṇāya namaḥ\noṁ śrī sāī karma dhvaṁsine namaḥ\noṁ śrī sāī sādhu mānasa śobhitāya namaḥ\noṁ śrī sāī sarva mata sammatāya namaḥ\noṁ śrī sāī sādhu mānasa pariśodhakāya namaḥ" },
      { label: "Names 97–108", script: "ॐ श्री साई साधकानुग्रह वट वृक्ष प्रतिष्ठापकाय नमः\nॐ श्री साई सकल संशय हराय नमः\nॐ श्री साई सकल तत्त्व बोधकाय नमः\nॐ श्री साई योगीश्वराय नमः\nॐ श्री साई योगीन्द्र वन्दिताय नमः\nॐ श्री साई सर्व मङ्गल कराय नमः\nॐ श्री साई सर्व सिद्धि प्रदाय नमः\nॐ श्री साई आपन्निवारिणे नमः\nॐ श्री साई आर्ति हराय नमः\nॐ श्री साई शान्त मूर्तये नमः\nॐ श्री साई सुलभ प्रसन्नाय नमः\nॐ श्री साई भगवान् श्री सत्य साई बाबाय नमः", roman: "oṁ śrī sāī sādhakānugraha vaṭa vṛkṣa pratiṣṭhāpakāya namaḥ\noṁ śrī sāī sakala saṁśaya harāya namaḥ\noṁ śrī sāī sakala tattva bodhakāya namaḥ\noṁ śrī sāī yogīśvarāya namaḥ\noṁ śrī sāī yogīndra vanditāya namaḥ\noṁ śrī sāī sarva maṅgala karāya namaḥ\noṁ śrī sāī sarva siddhi pradāya namaḥ\noṁ śrī sāī āpannivāriṇe namaḥ\noṁ śrī sāī ārti harāya namaḥ\noṁ śrī sāī śānta mūrtaye namaḥ\noṁ śrī sāī sulabha prasannāya namaḥ\noṁ śrī sāī bhagavān śrī satya sāī bābāya namaḥ" }
    ],
  }
];

async function main() {
  for (const chant of CHANTS) {
    const existing = await prisma.song.findFirst({
      where: { title: { equals: chant.title, mode: "insensitive" } },
      include: { verses: { orderBy: { order: "asc" } } },
    });

    if (existing) {
      // Touched by hand? Then it is theirs, and this stops.
      const untouched =
        existing.verses.length === chant.verses.length &&
        existing.verses.every(
          (v, i) => v.script === chant.verses[i].script && v.roman === chant.verses[i].roman,
        );
      if (!untouched) {
        console.log(`skip  ${chant.title} — edited since it was seeded`);
        continue;
      }
      if (existing.kind === "chant") {
        console.log(`ok    ${chant.title} — already seeded`);
        continue;
      }
      await prisma.song.update({ where: { id: existing.id }, data: { kind: "chant" } });
      console.log(`fixed ${chant.title} — marked as a chant`);
      continue;
    }

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
    console.log(`added ${chant.title} — ${chant.verses.length} verses`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
