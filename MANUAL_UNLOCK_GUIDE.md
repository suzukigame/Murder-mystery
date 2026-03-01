# キャラクター解放システムのカスタマイズガイド

このドキュメントでは、シークレットキャラクターの追加や、解放条件（実績）の変更・追加を行う手順をまとめます。

## 1. キャラクターの追加と基本設定
`nexus-war-app/src/data/skins.ts` を編集します。

`AVAILABLE_SKINS` 配列に新しい要素を追加します。

```typescript
{
  id: 'my-new-char',
  name: '新しいキャラ名',
  image: '/images/char_new.png', // 画像パス
  isSecret: true,               // 最初はシークレットにするか
  unlockCondition: 'win_as_hero', // 解放に必要な実績ID
  unlockHint: 'ヒーローとして1回勝利する' // ロック時に表示されるヒント
}
```

## 2. 実績判定ロジックの追加
実績（解放条件）を実際に判定する場所は主に2箇所です。

### A. クライアント側での判定
`nexus-war-app/src/components/GameScreen.tsx` の `handleGameEndStats` 関数内を編集します。

サーバーから送られてくる `playerStats`（勝敗情報など）を元に、実績IDを `newlyUnlocked` 配列に追加する処理を書きます。

```typescript
// 例: 特定の役職で勝利した場合
if (myStats.role === 'DevOps' && myStats.won) {
    newlyUnlocked.push('win_as_devops');
}

// 例: 累積回数をカウントする場合 (LocalStorageを使用)
const key = 'nexus_war_custom_count';
const count = parseInt(localStorage.getItem(key) || '0', 10) + 1;
localStorage.setItem(key, String(count));
if (count >= 10) {
    newlyUnlocked.push('play_10_times');
}
```

### B. サーバー側（勝敗・統計データ）の調整
新しい勝敗パターンや統計情報が必要な場合は、`nexus-war-server/src/gameLogic.ts` の `emitGameEndStats` 関数を編集します。

```typescript
// playerStats に含める情報を増やすなど
return {
    playerId: p.id,
    faction,
    won,
    role: p.role,
    // ここに新しい統計情報を追加可能
};
```

## 3. 実績データの永続化
実績の保存・読み出しは `nexus-war-app/src/hooks/useAchievements.ts` で管理されています。
現在はブラウザの `LocalStorage` を使用しており、`nexus_war_achievements` というキーで配列として保存されます。

## 4. 開発中のテスト（強制解放）
開発中に強制的に特定のキャラを解放したい場合は、ブラウザのコンソールで以下を実行してください。

```javascript
// 実績IDを追加して保存
const current = JSON.parse(localStorage.getItem('nexus_war_achievements') || '[]');
current.push('実績ID');
localStorage.setItem('nexus_war_achievements', JSON.stringify([...new Set(current)]));
// ページをリロードすると反映されます
```
