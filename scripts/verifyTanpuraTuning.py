"""
scripts/verifyTanpuraTuning.py — prove each recording is what its name claims.

Run: python3 scripts/verifyTanpuraTuning.py   (stdlib only, no dependencies)

Worth keeping because the thing most likely to go wrong when these files are
replaced is the least visible: a Madhyam recording filed under a Pancham name
still plays, still sounds like a tanpura, and is still at the right Sa. Only the
companion string is wrong, and almost nobody would catch that by ear on a phone.

Prove each file carries the drone string its NAME claims.

Sa alone cannot tell Madhyam from Pancham — both have it. The diagnostic is the
companion string: Madhyam sounds Ma (4/3 above Sa), Pancham sounds Pa (3/2).

Ma is the honest test, because Ma is not a harmonic of Sa, so energy there means
a string is playing it. Pa at 3/2 coincides with the 3rd harmonic of the octave
-below sa string, so Pa energy alone would prove nothing.

Goertzel at each target frequency; stdlib only.
"""
import wave,struct,math,glob,os
PC={'c':0,'c-sharp':1,'d':2,'d-sharp':3,'e':4,'f':5,'f-sharp':6,'g':7,'g-sharp':8,'a':9,'a-sharp':10,'b':11}

def read(p):
    w=wave.open(p,'rb'); n=w.getnframes(); r=w.getframerate()
    x=struct.unpack('<%dh'%n,w.readframes(n)); w.close(); return list(x),r

def goertzel(x,rate,freq):
    """Energy at one frequency, summed over 0.5s blocks so phase drift doesn't cancel."""
    N=int(rate*0.5); total=0.0; blocks=0
    for off in range(0,len(x)-N,N):
        k=freq*N/rate; wr=2*math.cos(2*math.pi*k/N)
        s1=s2=0.0
        for i in range(off,off+N):
            s0=x[i]+wr*s1-s2; s2=s1; s1=s0
        total+=(s1*s1+s2*s2-wr*s1*s2); blocks+=1
    return total/max(blocks,1)

def sa_freq(pc):
    """The octave of this pitch class nearest 130 Hz (where these were recorded)."""
    best=None
    for midi in range(24,60):
        if midi%12==pc:
            f=440*2**((midi-69)/12)
            if 65<=f<=270 and (best is None or abs(math.log(f/130.8))<abs(math.log(best/130.8))): best=f
    return best

print(f"{'file':<24}{'Sa Hz':<9}{'Ma/Sa':<9}{'Pa/Sa':<9}{'verdict'}")
# Resolve relative to this file, not to a home directory: the repo has moved
# once already and must also run from a second laptop.
AUDIO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'audio', 'tanpura', '*.wav')
for p in sorted(glob.glob(AUDIO)):
    base=os.path.basename(p)[:-4]; series,note=base.split('-',1)
    x,r=read(p)
    fsa=sa_freq(PC[note])
    # try Sa and Sa an octave down, take whichever has more energy as the reference
    cands=[fsa,fsa/2]
    esa,fsa=max(((goertzel(x,r,f),f) for f in cands), key=lambda t:t[0])
    ema=goertzel(x,r,fsa*4/3)
    epa=goertzel(x,r,fsa*3/2)
    ma=ema/esa; pa=epa/esa
    # The meaningful test is which companion string dominates, not an absolute
    # level: these are quiet partials next to Sa in every case. Require a clear
    # margin so a trace of the other note cannot pass.
    MARGIN = 3.0
    if series=='madhyam': ok = ma > pa*MARGIN
    else:                 ok = pa > ma*MARGIN
    print(f"{base:<24}{fsa:<9.1f}{ma:<9.3f}{pa:<9.3f}{('OK, ' + series + ' confirmed') if ok else 'MISMATCH'}")
