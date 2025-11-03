module.exports = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0"
 xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
 <edmx:DataServices>
  <Schema Namespace="UntypedNS"
   xmlns="http://docs.oasis-open.org/odata/ns/edm">

    <EntityType Name="UntypedEntity">
      <Key><PropertyRef Name="id"/></Key>
      <Property Name="id" Type="Edm.String"/>
      <Property Name="data" Type="Edm.Untyped"/>
    </EntityType>

    <EntityContainer Name="Container">
      <EntitySet Name="Campaigns" EntityType="UntypedNS.UntypedEntity"/>
    </EntityContainer>

  </Schema>
 </edmx:DataServices>
</edmx:Edmx>`;
