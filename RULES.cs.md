# Pif-paf-poe

Tic-tac-toe s RPG prvky. Tahová neběhací hra pro 24-60 hráčů na cca 2 hodiny.

Hráči tvoří dva týmy, X a O, které bojují v získávání bodů. Body se získávají pomocí stavění tří symbolů v řadě v aréně.

## Aréna

Aréna je herní prostor tvořený 6x6 nebo 9x9 poli (dle počtu hráčů), dále rozdělené na 4 nebo 9 zón o velikosti 3x3 pole. Každé pole v Aréně má náhodně přiřazeno "veto" konkrétního kamenu v duelu -- o tom později. Aréna je reprezentována v prostoru fyzicky: tedy všech 36 nebo 81 polí je rozmístěno po prostoru hry (např. vyvěšené na stromech), a v centrální lokaci je vyvěšená mapa celé arény včetně toho kdo drží dané pole.

V každém kole jeden tým útočí, druhý brání, v dalším kole se vystřídají.

Fáze kola:
- Hráči bránícího týmu se rozmístí na neobsazená pole arény, každý hráč na nějaké pole, může jich tam být více.
- Hráči útočícího týmu se rozmístí obdobným způsobem.
- Hráči bránícího týmu si rozdělí mezi sebe s jakým útočníkem budou bojovat. Zbylí bránící hráči se musí přesunout na ortogonálně sousedící pole kde je útočník v přesile, pokud takové je.
- Rozdělené dvojice sehrají duel -- pravidla duelu níže. Nespárovaní hráči se počítají jako kontumační výhra.
- Pole vyhraje ten tým, který zde vyhrál více duelů. Při remíze vyhrává obránce.
- Za vyhraný duel (ne kontumačně) si hráč přičte 1 XP. Také si přičte 1 XP pokud jeho tým vyhrál toto pole.
- Útočníci se vrátí do centrální lokace a zvolí si v každé zóně, kde vyhráli nějaké pole, na které z nich umístí svou značku.
- Všechny 3-v-řadě se vyhodnotí, včetně překrývajících. Za každé 3-v-řadě vybere útočník která zóna, do které 3-v-řadě zasáhlo, bude vyčištěna (zbavena značek obou týmů).
- Útočník obdrží body v počtu druhá mocnina počtu 3-v-řadě které vytvořil.

## Duel

Duel probíhá na hrací desce 3x3 ve stylu tradičního tic-tac-toe.

Každý hráč má u sebe 5 kamenů se znakem svého týmu (X/O), vylosované náhodně z nabídky 6 speciálních schopností:

- Šoup: Po umístění pohne řádkem nebo sloupcem na zvolenou stranu, přetékajíc obsah posledního pole na opačnou stranu.
- Rotát: Po umístění pohne zvoleným 2x2 čtvercem, jehož je součástí, po směru hodinových ručiček.
- 2048: Po umístění pohne všemi umístěnými kameny zvoleným směrem tak daleko dokud nenarazí ("gravitačně").
- Hora: Nepůsobí na ni pohybové efekty. Působí jako zarážka pro pohybující se kameny.
- Magnet: Vynucuje, aby soupeř hrál do sousedícího volného pole.
- Smraďoch: Vynucuje, aby soupeř hrál jinam než do sousedícího pole.

Pole arény může definovat "veto", určující jaký kámen při duelu zde pozbývá svůj efekt.

Hráč u sebe také má kartu se zásobou protiútoků, kde jsou vyznačené typy protiútoků a počty které má hráč k dispozici:

- Výstřednost: Pokud se ve středu desky nachází soupeřův kámen, vrať mu ho do ruky.
- Ústup: Přesuň libovolný svůj kámen na volné místo. Nezohledňuj Magnety a Smraďochy pro umístění a nevyhodnocuj pohybové schopnosti.
- Zrcadlo: Prohoď obsah dvou polí středově symetrických se středem.
- Vyhláška: Vynuť, aby soupeř ve svém dalším kole musel hrát konkrétní ze svých kamenů.
- Opáčko: Urči jeden svůj kámen na desce s pohybovým efektem. Pohybový efekt se provede ze současné pozice kamene, zvoleným směrem.

Při duelu hráči vyloží své kameny a karty protiútoků aby byly pro oba viditelné. Poté se střídají v tazích, přičemž hráč útočícího týmu začíná:
- Hráč na tahu zvolí jeden ze svých kamenů a umístí jej na takové volné pole desky, které uspokojí nejvyšší možný počet soupeřových umístěných Magnetů a Smraďochů.
- Provede se efekt kamene, pokud se jedná o pohyb.
- Pokud hraje obránce, smí využít protiútok, avšak jen jednou za duel. Škrtne si na svojí kartě jeden kus použitého protiútoku.
- Vyhodnotí se, zda vznikly 3-v-řadě. Pokud ano, daný hráč vítězí. Pokud vznikly oba naráz, vítězí obránce.
- Pokud je deska plná, vítězí obránce.

## Vylepšení

V centrální lokaci bude existovat obchod s vylepšeními.
- 3 XP: Vyměň jeden svůj kámen za jiný zvolený.
- 3 XP: Získej zvolený protiútok.

## Herní materiál

Materiál pro hráče:
- Kameny hráčů. Potřeba přibližně 12 na hráče.
- Karty protiútoků. Potřeba 1 na hráče.

Materiál pro řízení hry:
- Aréna ve velkém formátu, rozdělená na 9 papírů s 3x3 čtvercovou zónou arény 4 papíry (JZ, SZ, JV, SV) tvoří 6x6 arénu, doplněním 5 papírů (S, J, V, Z, C) vznikne 9x9 aréna. Tato poslouží dvakrát: v centrálním stanovišti se slepí velká přehledová tabulka celé arény, a na duelových stanovištích budou vyvěšeny rozstříhány jednotlivé čtverečky.
- Symboly X a O určené k vystřižení čtverečků a umisťování na pole papírové arény k vyznačení vlastnictví pole.

Materiál pro pomoc se hrou:
- Přehledová pomůcka kamenů.
- Přehledová pomůcka protiútoků.
